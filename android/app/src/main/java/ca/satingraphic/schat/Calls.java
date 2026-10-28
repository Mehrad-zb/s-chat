package ca.satingraphic.schat;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Person;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Incoming-call notification: full-screen on the lock screen, loops the phone's ringtone until answered/declined. */
public class Calls {
    static final int NOTIF_ID = 2001;
    static final String ACTION_END = "ca.satingraphic.schat.CALL_END";
    static volatile String currentCallId;

    static String safeId(String id) { return id == null ? "" : id.replaceAll("[^A-Za-z0-9_-]", ""); }

    static void showIncoming(Context ctx, String callId, long chatId, String name, boolean video) {
        callId = safeId(callId);
        if (callId.isEmpty() || callId.equals(currentCallId)) return;
        currentCallId = callId;

        Intent full = new Intent(ctx, IncomingCallActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION)
                .putExtra("call_id", callId).putExtra("chat_id", chatId).putExtra("name", name).putExtra("video", video);
        PendingIntent fullPi = PendingIntent.getActivity(ctx, 11, full, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        PendingIntent answerPi = PendingIntent.getActivity(ctx, 12, answerIntent(ctx, callId, chatId),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent decline = new Intent(ctx, CallActionReceiver.class).setAction("decline").putExtra("call_id", callId);
        PendingIntent declinePi = PendingIntent.getBroadcast(ctx, 13, decline, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        String what = video ? "Incoming video call · تماس تصویری" : "Incoming voice call · تماس صوتی";
        Notification.Builder b = new Notification.Builder(ctx, App.CH_CALLS)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF1AA978)
                .setContentTitle(name)
                .setContentText(what)
                .setCategory(Notification.CATEGORY_CALL)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setTimeoutAfter(60000)
                .setContentIntent(fullPi)
                .setFullScreenIntent(fullPi, true);
        if (Build.VERSION.SDK_INT >= 31) {
            Person caller = new Person.Builder().setName(name).setImportant(true).build();
            b.setStyle(Notification.CallStyle.forIncomingCall(caller, declinePi, answerPi));
        } else {
            b.addAction(new Notification.Action.Builder(null, "Decline · رد", declinePi).build());
            b.addAction(new Notification.Action.Builder(null, "Answer · پاسخ", answerPi).build());
        }
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT; // keep ringing
        ctx.getSystemService(NotificationManager.class).notify(NOTIF_ID, n);
    }

    static Intent answerIntent(Context ctx, String callId, long chatId) {
        return new Intent(ctx, MainActivity.class)
                .setAction("answer")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("answer", safeId(callId)).putExtra("chat_id", chatId);
    }

    /** Stop ringing (answered, declined, cancelled by the caller, or answered on another device). */
    static void dismiss(Context ctx, String callId) {
        callId = safeId(callId);
        if (currentCallId != null && !currentCallId.equals(callId) && !callId.isEmpty()) return;
        currentCallId = null;
        ctx.getSystemService(NotificationManager.class).cancel(NOTIF_ID);
        ctx.sendBroadcast(new Intent(ACTION_END).setPackage(ctx.getPackageName()));
    }

    /** Decline: tell the server (socket if connected, otherwise HTTPS). */
    static void decline(Context ctx, String callId) {
        final String id = safeId(callId);
        dismiss(ctx, id);
        if (!PushService.send("{\"t\":\"call:reject\",\"call_id\":\"" + id + "\"}")) {
            final String tok = App.token(ctx);
            if (tok == null) return;
            new Thread(() -> {
                try {
                    okhttp3.OkHttpClient c = new okhttp3.OkHttpClient();
                    okhttp3.Request r = new okhttp3.Request.Builder()
                            .url("https://" + App.HOST + "/api/calls/" + id + "/reject")
                            .header("Authorization", "Bearer " + tok)
                            .post(okhttp3.RequestBody.create(new byte[0], (okhttp3.MediaType) null))
                            .build();
                    c.newCall(r).execute().close();
                } catch (Exception ignored) {}
            }).start();
        }
    }
}
