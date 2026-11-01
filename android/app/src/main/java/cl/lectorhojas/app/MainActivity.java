package cl.lectorhojas.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ArchivosPlugin.class);
        // Suscripción de CorrigeYa Plus (Google Play): sólo existe en la app Pro.
        try {
            registerPlugin(Class.forName("cl.lectorhojas.app.SuscripcionPlugin").asSubclass(Plugin.class));
        } catch (ClassNotFoundException e) {
            // Versión normal: sin suscripción.
        }
        super.onCreate(savedInstanceState);
    }
}
