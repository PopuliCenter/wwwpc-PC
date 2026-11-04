package com.populicenter.survei;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Plugin lokal wajib didaftarkan sebelum Bridge dibuat di super.onCreate.
        registerPlugin(PopuliThemePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
