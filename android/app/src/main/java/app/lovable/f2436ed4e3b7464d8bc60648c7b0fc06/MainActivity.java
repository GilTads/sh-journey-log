package app.lovable.f2436ed4e3b7464d8bc60648c7b0fc06;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(BackgroundLocationPlugin.class);
    }
}
