package com.populicenter.survei;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Build;
import android.view.Window;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Menyelaraskan jendela Android dengan tema yang dipilih di aplikasi: ikon bar, warna di
 * balik bar, dan latar WebView sebelum halaman tergambar.
 *
 * Tema DayNight hanya mengikuti mode gelap HP, jadi pilihan Gelap atau Terang yang berbeda
 * dari sistem perlu disetel di sini. SystemBars dari @capacitor/core tidak cukup: ia hanya
 * mengatur warna ikon, lalu mengembalikan latar jendela ke windowBackground tema setiap kali
 * dipanggil. AppCompatDelegate.setDefaultNightMode juga tidak dipakai: uiMode ada di
 * configChanges agar WebView tidak dimuat ulang saat mengisi survei, sehingga warna bar tetap
 * harus disetel manual, dan prefers-color-scheme tidak lagi melaporkan pilihan sistem.
 */
@CapacitorPlugin(name = "PopuliTheme")
public class PopuliThemePlugin extends Plugin {

    private static final String PREFS_NAME = "populi_theme";
    private static final String KEY_CHOICE = "choice";
    private static final String CHOICE_SYSTEM = "system";
    private static final String CHOICE_LIGHT = "light";
    private static final String CHOICE_DARK = "dark";
    /** Batas tunggu sebelum WebView ditampilkan paksa, bila JavaScript gagal berjalan. */
    private static final long REVEAL_TIMEOUT_MS = 3000;

    /** Tema yang sedang tampil di halaman. Hanya disentuh di main thread. */
    private boolean dark;
    /** Hanya disentuh di main thread. */
    private boolean revealed;

    @Override
    public void load() {
        // localStorage belum terbaca di sini, jadi pilihan terakhir disimpan juga di native
        // agar frame pertama sudah memakai warna yang benar.
        dark = readStoredTheme();
        disallowAlgorithmicDarkening();
        applyToWindow();
        hideUntilThemed();
        // SystemBars sudah mengantrekan gaya awalnya saat load (ia didaftarkan lebih dulu oleh
        // Bridge), dan itu menimpa ikon serta latar jendela. Antrean ini berjalan sesudahnya.
        getBridge().executeOnMainThread(this::applyToWindow);
    }

    /**
     * Dipanggil syncNativeBars di theme.ts setiap tema dipasang. followSystem menentukan apa
     * yang disimpan untuk pembukaan berikutnya; warna saat ini selalu mengikuti halaman.
     */
    @PluginMethod
    public void setAppearance(PluginCall call) {
        boolean nextDark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        boolean followSystem = Boolean.TRUE.equals(call.getBoolean("followSystem", true));
        String choice = followSystem ? CHOICE_SYSTEM : nextDark ? CHOICE_DARK : CHOICE_LIGHT;
        preferences().edit().putString(KEY_CHOICE, choice).apply();

        getBridge().executeOnMainThread(() -> {
            dark = nextDark;
            applyToWindow();
            revealWhenPainted();
            call.resolve();
        });
    }

    /**
     * Saat dokumen mulai dimuat, WebView melukis kanvas gelap bila HP gelap walau pilihan di
     * aplikasi Terang, dan setBackgroundColor belum berlaku. Sampai halaman memasang temanya,
     * yang tampil adalah latar jendela. Memakai alpha, bukan visibility, agar halaman tetap
     * dimuat dan digambar.
     */
    private void hideUntilThemed() {
        WebView webView = getBridge().getWebView();
        webView.setAlpha(0f);
        webView.postDelayed(this::reveal, REVEAL_TIMEOUT_MS);
    }

    /** setAppearance datang sebelum render berikutnya, jadi tunggu sampai temanya siap digambar. */
    private void revealWhenPainted() {
        if (revealed) return;
        getBridge()
            .getWebView()
            .postVisualStateCallback(
                0,
                new WebView.VisualStateCallback() {
                    @Override
                    public void onComplete(long requestId) {
                        reveal();
                    }
                }
            );
    }

    private void reveal() {
        if (revealed) return;
        revealed = true;
        getBridge().getWebView().setAlpha(1f);
    }

    /**
     * SystemBars menimpa ikon dan latar jendela pada setiap perubahan konfigurasi, dengan urutan
     * plugin yang tidak tetap (HashMap), jadi warna dipasang ulang lewat antrean. Sengaja memakai
     * tema terakhir, bukan uiMode: bila mode gelap HP berubah dan halaman ikut berganti, theme.ts
     * memanggil setAppearance; bila tidak, bar tetap senada dengan halaman.
     */
    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        getBridge().executeOnMainThread(this::applyToWindow);
    }

    private boolean readStoredTheme() {
        String choice = preferences().getString(KEY_CHOICE, CHOICE_SYSTEM);
        if (CHOICE_DARK.equals(choice)) return true;
        if (CHOICE_LIGHT.equals(choice)) return false;
        int nightMode = getContext().getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return nightMode == Configuration.UI_MODE_NIGHT_YES;
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    /**
     * Halaman punya tema gelap sendiri dan tidak boleh diwarnai ulang oleh WebView. Dengan
     * targetSdk 33+ bawaannya sudah tidak diizinkan; di sini ditegaskan selama API-nya ada.
     */
    private void disallowAlgorithmicDarkening() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getBridge().getWebView().getSettings().setAlgorithmicDarkeningAllowed(false);
        }
    }

    private void applyToWindow() {
        Context context = getContext();
        int chrome = ContextCompat.getColor(context, dark ? R.color.populi_chrome_dark : R.color.populi_chrome_light);
        int surface = ContextCompat.getColor(context, dark ? R.color.populi_surface_dark : R.color.populi_surface_light);

        Window window = getActivity().getWindow();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(!dark);
        window.setStatusBarColor(chrome);
        // Di API 24-25 ikon bar navigasi tidak bisa gelap, jadi warnanya dibiarkan bawaan.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            controller.setAppearanceLightNavigationBars(!dark);
            window.setNavigationBarColor(chrome);
        }
        // Android 15+ mengabaikan warna bar di atas; yang tampil di balik bar adalah latar ini.
        window.getDecorView().setBackgroundColor(chrome);

        getBridge().getWebView().setBackgroundColor(surface);
    }
}
