package ca.satingraphic.schat;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Full-screen "incoming call" screen shown over the lock screen (like WhatsApp). */
public class IncomingCallActivity extends Activity {
    private String callId;
    private long chatId;
    private final BroadcastReceiver endRx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { finishAndRemoveTask(); }
    };

    private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setShowWhenLocked(true);
        setTurnScreenOn(true);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        Intent in = getIntent();
        callId = Calls.safeId(in.getStringExtra("call_id"));
        chatId = in.getLongExtra("chat_id", 0);
        String name = in.getStringExtra("name");
        if (name == null) name = "Satin Connect";
        boolean video = in.getBooleanExtra("video", false);
        if (Calls.currentCallId == null || !Calls.currentCallId.equals(callId)) { finish(); return; }

        FrameLayout root = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xFF12382B, 0xFF0B1511});
        root.setBackground(bg);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams tlp = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        tlp.topMargin = dp(110);
        root.addView(top, tlp);

        TextView av = new TextView(this);
        av.setText(name.isEmpty() ? "?" : name.substring(0, 1).toUpperCase());
        av.setTextColor(Color.WHITE);
        av.setTextSize(44);
        av.setTypeface(Typeface.DEFAULT_BOLD);
        av.setGravity(Gravity.CENTER);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(0xFF1AA978);
        av.setBackground(circle);
        top.addView(av, new LinearLayout.LayoutParams(dp(112), dp(112)));

        TextView nm = new TextView(this);
        nm.setText(name);
        nm.setTextColor(Color.WHITE);
        nm.setTextSize(28);
        nm.setTypeface(Typeface.DEFAULT_BOLD);
        nm.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(-1, -2);
        nlp.topMargin = dp(22);
        top.addView(nm, nlp);

        TextView sub = new TextView(this);
        sub.setText(video ? "Satin Connect video call · تماس تصویری" : "Satin Connect voice call · تماس صوتی");
        sub.setTextColor(0xCCFFFFFF);
        sub.setTextSize(15);
        sub.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(-1, -2);
        slp.topMargin = dp(8);
        top.addView(sub, slp);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams rlp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        rlp.bottomMargin = dp(90);
        root.addView(row, rlp);

        row.addView(button("✕", "Decline · رد", 0xFFE5484D, v -> {
            Calls.decline(this, callId);
            finishAndRemoveTask();
        }));
        View gap = new View(this);
        row.addView(gap, new LinearLayout.LayoutParams(dp(90), 1));
        row.addView(button("📞", "Answer · پاسخ", 0xFF1AA978, v -> answer()));

        setContentView(root);
        IntentFilter f = new IntentFilter(Calls.ACTION_END);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(endRx, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(endRx, f);
    }

    private View button(String glyph, String label, int color, View.OnClickListener click) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView btn = new TextView(this);
        btn.setText(glyph);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(30);
        btn.setGravity(Gravity.CENTER);
        GradientDrawable c = new GradientDrawable();
        c.setShape(GradientDrawable.OVAL);
        c.setColor(color);
        btn.setBackground(c);
        btn.setOnClickListener(click);
        col.addView(btn, new LinearLayout.LayoutParams(dp(76), dp(76)));
        TextView l = new TextView(this);
        l.setText(label);
        l.setTextColor(0xDDFFFFFF);
        l.setTextSize(13);
        l.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(-2, -2);
        llp.topMargin = dp(10);
        col.addView(l, llp);
        return col;
    }

    private void answer() {
        Calls.currentCallId = null;
        getSystemService(android.app.NotificationManager.class).cancel(Calls.NOTIF_ID);
        startActivity(Calls.answerIntent(this, callId, chatId));
        finishAndRemoveTask();
    }

    @Override
    public void onBackPressed() { /* ignore: use the buttons */ }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(endRx); } catch (Exception ignored) {}
        super.onDestroy();
    }
}
