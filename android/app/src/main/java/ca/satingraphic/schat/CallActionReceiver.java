package ca.satingraphic.schat;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if ("decline".equals(intent.getAction())) Calls.decline(ctx, intent.getStringExtra("call_id"));
    }
}
