package ca.satingraphic.schat;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Keeps one WebSocket open to the server (like Telegram's "keep-alive" service) so that incoming
 * calls ring full-screen and messages show notifications even when the app is closed or the phone is locked.
 * Does not depend on Google services, so it also works in Iran.
 */
public class PushService extends Service {
    private static final String TAG = "SatinPush";
    static final int NOTIF_ID = 1;
    static volatile PushService instance;

    private final Handler main = new Handler(Looper.getMainLooper());
    private OkHttpClient client;
    private WebSocket socket;
    private boolean connected = false, connecting = false, stopped = false;
    private int attempt = 0;
    private ConnectivityManager.NetworkCallback netCb;
    private final Runnable reconnect = this::reconnectNow;

    static void start(Context ctx) {
        try {
            ctx.startForegroundService(new Intent(ctx, PushService.class));
        } catch (Exception e) {
            Log.w(TAG, "start failed: " + e);
        }
    }

    static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, PushService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        client = new OkHttpClient.Builder()
                .pingInterval(25, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .connectTimeout(20, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build();
        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        netCb = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network n) { main.post(() -> { attempt = 0; if (!connected) reconnectNow(); }); }
        };
        try { cm.registerDefaultNetworkCallback(netCb); } catch (Exception ignored) {}
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIF_ID, statusNotification());
        stopped = false;
        if (App.token(this) == null) { stopSelf(); return START_NOT_STICKY; }
        if (!connected && !connecting) connect();
        scheduleKeepAlive();
        return START_STICKY;
    }

    private Notification statusNotification() {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, App.CH_SERVICE)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("Satin Connect")
                .setContentText("Ready for messages and calls · آماده‌ی دریافت پیام و تماس")
                .setContentIntent(pi)
                .setOngoing(true)
                .setShowWhen(false)
                .build();
    }

    private void connect() {
        String tok = App.token(this);
        if (tok == null) { stopSelf(); return; }
        connecting = true;
        String url;
        try { url = "wss://" + App.HOST + "/ws?bg=1&token=" + URLEncoder.encode(tok, "UTF-8"); }
        catch (Exception e) { return; }
        Request req = new Request.Builder().url(url).header("User-Agent", "SChatAndroid-service").build();
        socket = client.newWebSocket(req, new WebSocketListener() {
            @Override public void onOpen(WebSocket ws, Response r) {
                main.post(() -> { connected = true; connecting = false; attempt = 0; });
            }
            @Override public void onMessage(WebSocket ws, String text) { handle(text); }
            @Override public void onClosed(WebSocket ws, int code, String reason) { lost(ws, code); }
            @Override public void onClosing(WebSocket ws, int code, String reason) { ws.close(1000, null); }
            @Override public void onFailure(WebSocket ws, Throwable t, Response r) { Log.w(TAG, "ws failure: " + t); lost(ws, 0); }
        });
    }

    private void lost(WebSocket ws, int code) {
        main.post(() -> {
            if (ws != socket) return;
            connected = false; connecting = false; socket = null;
            if (stopped) return;
            if (code == 4001) { App.setToken(this, null); stopSelf(); return; } // signed out
            long[] waits = {1000, 2000, 4000, 8000, 15000, 30000, 60000};
            long wait = waits[Math.min(attempt++, waits.length - 1)];
            main.removeCallbacks(reconnect);
            main.postDelayed(reconnect, wait);
        });
    }

    private void reconnectNow() {
        if (stopped || connected || connecting) return;
        connect();
    }

    private void handle(String text) {
        try {
            JSONObject m = new JSONObject(text);
            String t = m.optString("t");
            switch (t) {
                case "auth-error":
                    App.setToken(this, null);
                    main.post(this::stopSelf);
                    break;
                case "call:invite": {
                    String callId = m.optString("call_id");
                    JSONObject from = m.optJSONObject("from");
                    String name = from != null ? from.optString("name", "Satin Connect") : "Satin Connect";
                    long chatId = m.optLong("chat_id");
                    boolean video = m.optBoolean("video");
                    send("{\"t\":\"call:ringing\",\"call_id\":" + JSONObject.quote(callId) + "}");
                    // if the app is open on screen the web page shows its own call screen
                    if (!MainActivity.visible) {
                        wakeScreen();
                        Calls.showIncoming(this, callId, chatId, name, video);
                    }
                    break;
                }
                case "call:end":
                    Calls.dismiss(this, m.optString("call_id"));
                    break;
                case "notify":
                    if (!MainActivity.visible) Notifs.show(this, m);
                    break;
                default:
                    break;
            }
        } catch (Exception e) {
            Log.w(TAG, "bad message: " + e);
        }
    }

    private void wakeScreen() {
        try {
            PowerManager pm = getSystemService(PowerManager.class);
            @SuppressWarnings("deprecation")
            PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "satin:call");
            wl.acquire(10000);
        } catch (Exception ignored) {}
    }

    static boolean send(String json) {
        PushService s = instance;
        return s != null && s.socket != null && s.socket.send(json);
    }

    /** A cheap alarm every ~15 min restarts the service/connection if Android killed it. */
    private void scheduleKeepAlive() {
        AlarmManager am = getSystemService(AlarmManager.class);
        PendingIntent pi = PendingIntent.getBroadcast(this, 7, new Intent(this, BootReceiver.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        try { am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 15 * 60 * 1000, pi); }
        catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        stopped = true;
        instance = null;
        main.removeCallbacksAndMessages(null);
        if (socket != null) socket.close(1000, null);
        try { getSystemService(ConnectivityManager.class).unregisterNetworkCallback(netCb); } catch (Exception ignored) {}
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
