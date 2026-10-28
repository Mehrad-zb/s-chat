package ca.satingraphic.schat;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Person;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Message and missed-call notifications (one per chat, stacking the latest lines like WhatsApp). */
public class Notifs {
    private static final Map<Long, List<String[]>> lines = new HashMap<>();
    private static final int MISSED_BASE = 500000;

    static synchronized void show(Context ctx, JSONObject m) {
        long chatId = m.optLong("chat_id");
        String kind = m.optString("kind", "message");
        String title = m.optString("title", "Satin Connect");
        String body = m.optString("body", "");
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);

        Intent open = new Intent(ctx, MainActivity.class).setAction("open-chat")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("chat_id", chatId);
        PendingIntent pi = PendingIntent.getActivity(ctx, (int) (chatId % 100000), open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        if ("missed-call".equals(kind)) {
            Notification n = new Notification.Builder(ctx, App.CH_MISSED)
                    .setSmallIcon(R.drawable.ic_stat).setColor(0xFFE5484D)
                    .setContentTitle(title).setContentText(body)
                    .setCategory(Notification.CATEGORY_MISSED_CALL)
                    .setAutoCancel(true).setContentIntent(pi).build();
            nm.notify(MISSED_BASE + (int) (chatId % 100000), n);
            return;
        }

        List<String[]> list = lines.get(chatId);
        if (list == null) { list = new ArrayList<>(); lines.put(chatId, list); }
        boolean group = m.optBoolean("group");
        String sender = title, text = body;
        if (group) {
            int i = body.indexOf(": ");
            if (i > 0 && i < 64) { sender = body.substring(0, i); text = body.substring(i + 2); }
        }
        list.add(new String[]{sender, text, String.valueOf(System.currentTimeMillis())});
        while (list.size() > 7) list.remove(0);

        Person me = new Person.Builder().setName("You").build();
        Notification.MessagingStyle style = new Notification.MessagingStyle(me);
        if (group) { style.setConversationTitle(title); style.setGroupConversation(true); }
        for (String[] l : list) style.addMessage(l[1], Long.parseLong(l[2]), new Person.Builder().setName(l[0]).build());

        Notification n = new Notification.Builder(ctx, App.CH_MESSAGES)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF1AA978)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(style)
                .setNumber(list.size())
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setOnlyAlertOnce(false)
                .setContentIntent(pi)
                .build();
        nm.notify((int) (chatId % 100000), n);
    }

    /** The app came to the screen: clear message notifications. */
    static synchronized void clearMessages(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        try {
            for (android.service.notification.StatusBarNotification sb : nm.getActiveNotifications()) {
                int id = sb.getId();
                if (id != PushService.NOTIF_ID && id != Calls.NOTIF_ID) nm.cancel(id);
            }
        } catch (Exception ignored) {}
        lines.clear();
    }
}
