package ca.satingraphic.schat;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;

public class App extends Application {
    public static final String HOST = BuildConfig.HOST;
    public static final String CH_CALLS = "calls_v1";
    public static final String CH_MESSAGES = "messages_v1";
    public static final String CH_MISSED = "missed_v1";
    public static final String CH_SERVICE = "service_v1";

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels(this);
        if (token(this) != null) PushService.start(this);
    }

    static void createChannels(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);

        NotificationChannel calls = new NotificationChannel(CH_CALLS, "Calls · تماس‌ها", NotificationManager.IMPORTANCE_HIGH);
        Uri ring = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        calls.setSound(ring, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        calls.enableVibration(true);
        calls.setVibrationPattern(new long[]{0, 900, 600, 900, 600});
        calls.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        calls.setBypassDnd(true);
        nm.createNotificationChannel(calls);

        NotificationChannel msgs = new NotificationChannel(CH_MESSAGES, "Messages · پیام‌ها", NotificationManager.IMPORTANCE_HIGH);
        msgs.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        msgs.enableVibration(true);
        msgs.setVibrationPattern(new long[]{0, 180, 120, 180});
        msgs.enableLights(true);
        msgs.setLightColor(0xFF1AA978);
        msgs.setShowBadge(true);
        nm.createNotificationChannel(msgs);

        NotificationChannel missed = new NotificationChannel(CH_MISSED, "Missed calls · تماس‌های از دست رفته", NotificationManager.IMPORTANCE_HIGH);
        nm.createNotificationChannel(missed);

        NotificationChannel svc = new NotificationChannel(CH_SERVICE, "Connection status · وضعیت اتصال", NotificationManager.IMPORTANCE_MIN);
        svc.setShowBadge(false);
        svc.setSound(null, null);
        nm.createNotificationChannel(svc);
    }

    static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences("satin", Context.MODE_PRIVATE); }
    static String token(Context ctx) { return prefs(ctx).getString("token", null); }
    static void setToken(Context ctx, String t) {
        if (t == null || t.isEmpty()) prefs(ctx).edit().remove("token").apply();
        else prefs(ctx).edit().putString("token", t).apply();
    }
}
