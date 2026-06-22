# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── Capacitor & plugin keep-rules (R8) ──────────────────────────────────────
# Bridge Capacitor menemukan plugin via refleksi/anotasi → JANGAN di-strip.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.PluginMethod <methods>;
}
# Interface JavaScript ke WebView.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
# Plugin pihak ketiga (push, geolocation, local-notif, social login).
-keep class com.capacitorjs.** { *; }
-keep class ee.forgr.capacitor.social.login.** { *; }
# Firebase / Google Play Services (FCM, Google Sign-In).
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.**
