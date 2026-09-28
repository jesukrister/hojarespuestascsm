package cl.lectorhojas.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ArchivosPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
