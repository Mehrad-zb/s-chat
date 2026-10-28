package ca.satingraphic.schat;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Starts the background connection after a reboot / app update, and from the keep-alive alarm. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (App.token(ctx) != null) PushService.start(ctx);
    }
}
