package com.populicenter.survei;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Status & pintasan Setelan HP untuk kartu ajakan di beranda responden
 * (services/devicePermissions.ts): "Nyalakan notifikasi", "Izinkan lokasi", "Nyalakan GPS".
 *
 * Plugin bawaan Capacitor tidak cukup: PushNotifications.checkPermissions hanya melihat izin
 * runtime Android 13+, padahal notifikasi juga bisa dimatikan pengguna di Setelan aplikasi
 * (semua versi Android). Status GPS (lokasi perangkat menyala atau tidak) dan membuka
 * halaman Setelan yang tepat juga tidak tersedia.
 */
@CapacitorPlugin(name = "PopuliSettings")
public class PopuliSettingsPlugin extends Plugin {

    /** { notificationsEnabled, locationEnabled } */
    @PluginMethod
    public void getStatus(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("notificationsEnabled", NotificationManagerCompat.from(context).areNotificationsEnabled());
        LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        result.put("locationEnabled", locationManager != null && LocationManagerCompat.isLocationEnabled(locationManager));
        call.resolve(result);
    }

    /**
     * Buka Setelan: target "notifications" (notifikasi aplikasi ini), "location" (GPS
     * perangkat), atau "app" (info aplikasi, untuk izin yang sudah ditolak permanen).
     */
    @PluginMethod
    public void openSettings(PluginCall call) {
        String target = call.getString("target", "app");
        String pkg = getContext().getPackageName();
        Intent intent;
        if ("notifications".equals(target) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        } else if ("location".equals(target)) {
            intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
        } else {
            intent = appDetails(pkg);
        }
        try {
            getActivity().startActivity(intent);
        } catch (ActivityNotFoundException primary) {
            try {
                getActivity().startActivity(appDetails(pkg));
            } catch (ActivityNotFoundException fallback) {
                call.reject("Setelan tidak bisa dibuka");
                return;
            }
        }
        call.resolve();
    }

    private static Intent appDetails(String pkg) {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", pkg, null));
    }
}
