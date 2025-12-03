package app.lovable.f2436ed4e3b7464d8bc60648c7b0fc06;

import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "BackgroundLocation")
public class BackgroundLocationPlugin extends Plugin {

    @PluginMethod
    public void startService(PluginCall call) {
        Context context = getContext();
        Intent serviceIntent = new Intent(context, LocationForegroundService.class);
        serviceIntent.putExtra("title", call.getString("title", "Viagem em andamento"));
        serviceIntent.putExtra(
                "text", call.getString("text", "Capturando localização em segundo plano"));
        ContextCompat.startForegroundService(context, serviceIntent);
        call.resolve();
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        Context context = getContext();
        Intent serviceIntent = new Intent(context, LocationForegroundService.class);
        context.stopService(serviceIntent);
        call.resolve();
    }
}
