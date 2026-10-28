package ca.satingraphic.schat;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.KeyguardManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/** The Satin Connect web app full screen, with native calls/notifications behind it. */
public class MainActivity extends Activity {
    static volatile boolean visible = false;
    private static final int REQ_PERMS = 1, REQ_FILE = 2, REQ_WEB_PERMS = 3;

    private WebView web;
    private ValueCallback<Uri[]> fileCb;
    private PermissionRequest pendingWebPerm;

    private String base() { return "https://" + App.HOST + "/"; }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        web.setBackgroundColor(0xFFFFFFFF);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " SChatAndroid/2");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);

        web.addJavascriptInterface(new Bridge(), "SatinNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (App.HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) {}
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest req) {
                runOnUiThread(() -> handleWebPermission(req));
            }
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE);
                String[] types = params.getAcceptTypes();
                String type = (types != null && types.length > 0 && types[0] != null && !types[0].isEmpty()) ? types[0] : "*/*";
                if (types != null && types.length > 1) { pick.setType("*/*"); pick.putExtra(Intent.EXTRA_MIME_TYPES, types); }
                else pick.setType(type.contains("/") ? type : "*/*");
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(pick, null), REQ_FILE); }
                catch (Exception e) { fileCb = null; return false; }
                return true;
            }
        });
        web.setDownloadListener((url, ua, disposition, mime, len) -> download(url, ua, disposition, mime));

        String url = base() + "?source=android";
        Intent in = getIntent();
        String answer = in != null ? Calls.safeId(in.getStringExtra("answer")) : "";
        long chat = in != null ? in.getLongExtra("chat_id", 0) : 0;
        if (!answer.isEmpty()) url += "&answer=" + answer + "&chat=" + chat;
        else if (chat > 0) url += "&chat=" + chat;
        else if (in != null && in.getData() != null && App.HOST.equals(in.getData().getHost())) url = in.getData().toString();
        if (!answer.isEmpty()) onAnswering();
        web.loadUrl(url);

        askBasics();
    }

    @Override
    protected void onNewIntent(Intent in) {
        super.onNewIntent(in);
        setIntent(in);
        String answer = Calls.safeId(in.getStringExtra("answer"));
        long chat = in.getLongExtra("chat_id", 0);
        if (!answer.isEmpty()) {
            onAnswering();
            js("window.__answer='" + answer + "';if(window.Call&&Call.cur&&Call.cur.id==='" + answer + "'&&Call.cur.state==='incoming'){window.__answer=null;Call.accept();}");
        } else if (chat > 0) {
            js("if(window.Chat&&window.S&&S.chats&&S.chats.get(" + chat + "))Chat.open(" + chat + ");");
        }
    }

    /** Answering from the lock screen: show over it and ask to unlock (the call already connects). */
    private void onAnswering() {
        Calls.dismiss(this, Calls.currentCallId == null ? "" : Calls.currentCallId);
        setShowWhenLocked(true);
        setTurnScreenOn(true);
        KeyguardManager km = getSystemService(KeyguardManager.class);
        if (km != null && km.isKeyguardLocked()) km.requestDismissKeyguard(this, null);
    }

    private void js(String code) { web.post(() -> web.evaluateJavascript(code, null)); }

    // ---------- permissions ----------
    private void askBasics() {
        List<String> need = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            need.add(Manifest.permission.POST_NOTIFICATIONS);
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.RECORD_AUDIO);
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.CAMERA);
        if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), REQ_PERMS);
    }

    /** Ask once to be excluded from battery optimisation, so calls arrive while the phone sleeps. */
    private void askBattery() {
        try {
            PowerManager pm = getSystemService(PowerManager.class);
            if (pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            if (App.prefs(this).getBoolean("asked_battery", false)) return;
            App.prefs(this).edit().putBoolean("asked_battery", true).apply();
            @SuppressLint("BatteryLife")
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception ignored) {}
    }

    private void handleWebPermission(PermissionRequest req) {
        List<String> need = new ArrayList<>();
        for (String r : req.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.RECORD_AUDIO);
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.CAMERA);
        }
        if (need.isEmpty()) { req.grant(req.getResources()); return; }
        if (pendingWebPerm != null) pendingWebPerm.deny();
        pendingWebPerm = req;
        requestPermissions(need.toArray(new String[0]), REQ_WEB_PERMS);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == REQ_WEB_PERMS && pendingWebPerm != null) {
            List<String> ok = new ArrayList<>();
            for (String r : pendingWebPerm.getResources()) {
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) ok.add(r);
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) ok.add(r);
            }
            if (ok.isEmpty()) pendingWebPerm.deny(); else pendingWebPerm.grant(ok.toArray(new String[0]));
            pendingWebPerm = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != REQ_FILE || fileCb == null) return;
        Uri[] uris = null;
        if (result == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                uris = new Uri[n];
                for (int i = 0; i < n; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) uris = new Uri[]{data.getData()};
        }
        fileCb.onReceiveValue(uris);
        fileCb = null;
    }

    private void download(String url, String ua, String disposition, String mime) {
        try {
            if (!url.startsWith("https://")) { Toast.makeText(this, "Download not supported", Toast.LENGTH_SHORT).show(); return; }
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            String name = URLUtil.guessFileName(url, disposition, mime);
            r.setMimeType(mime);
            r.addRequestHeader("User-Agent", ua);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) r.addRequestHeader("Cookie", cookies);
            String tok = App.token(this);
            if (tok != null) r.addRequestHeader("Authorization", "Bearer " + tok);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            getSystemService(DownloadManager.class).enqueue(r);
            Toast.makeText(this, name, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
        }
    }

    // ---------- lifecycle ----------
    @Override
    protected void onResume() {
        super.onResume();
        visible = true;
        web.onResume();
        js("window.__nativeVisible&&window.__nativeVisible(true)");
        Notifs.clearMessages(this);
    }

    @Override
    protected void onPause() {
        visible = false;
        js("window.__nativeVisible&&window.__nativeVisible(false)");
        super.onPause();
        // keep the page (and an ongoing call) running in the background
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.__nativeBack?window.__nativeBack():false", r -> {
            if ("true".equals(r)) return;
            if (web.canGoBack()) web.goBack(); else moveTaskToBack(true);
        });
    }

    @Override
    protected void onDestroy() {
        visible = false;
        if (web != null) { web.destroy(); }
        super.onDestroy();
    }

    // ---------- JavaScript bridge (window.SatinNative) ----------
    class Bridge {
        @JavascriptInterface
        public void setSession(String token) {
            if (token == null || token.isEmpty()) return;
            boolean fresh = !token.equals(App.token(MainActivity.this));
            App.setToken(MainActivity.this, token);
            runOnUiThread(() -> {
                PushService.start(MainActivity.this);
                if (fresh) askBattery();
            });
        }

        @JavascriptInterface
        public void clearSession() {
            App.setToken(MainActivity.this, null);
            runOnUiThread(() -> PushService.stop(MainActivity.this));
        }

        @JavascriptInterface
        public void inCall(boolean active, boolean video) {
            runOnUiThread(() -> {
                AudioManager am = getSystemService(AudioManager.class);
                if (active) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                    am.setSpeakerphoneOn(video);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    am.setSpeakerphoneOn(false);
                    am.setMode(AudioManager.MODE_NORMAL);
                    setShowWhenLocked(false);
                    setTurnScreenOn(false);
                }
            });
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> {
                Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                try { startActivity(i); } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public String version() { return BuildConfig.VERSION_NAME; }
    }
}
