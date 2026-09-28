package cl.lectorhojas.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Lo que una página web no puede hacer sola dentro de la app:
 * guardar archivos en Descargas, compartirlos e imprimir.
 */
@CapacitorPlugin(name = "Archivos")
public class ArchivosPlugin extends Plugin {

    private static final String CARPETA = "LectorHojas";

    /** Guarda un archivo en Descargas/LectorHojas. */
    @PluginMethod
    public void guardar(PluginCall call) {
        String nombre = limpiarNombre(call.getString("nombre", "archivo"));
        String mime = call.getString("mime", "application/octet-stream");
        String datos = call.getString("datos");
        if (datos == null) {
            call.reject("No hay datos para guardar.");
            return;
        }
        try {
            byte[] bytes = Base64.decode(datos, Base64.DEFAULT);
            JSObject ret = new JSObject();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, nombre);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + CARPETA);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("no se pudo crear el archivo");
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new Exception("no se pudo escribir el archivo");
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(uri, values, null, null);
                ret.put("ubicacion", "Descargas/" + CARPETA);
                ret.put("uri", uri.toString());
            } else {
                // Android 7 a 9: carpeta de la app (no necesita permisos).
                File dir = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), CARPETA);
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("no se pudo crear la carpeta");
                File file = new File(dir, nombre);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                ret.put("ubicacion", dir.getAbsolutePath());
                ret.put("uri", uriDe(file).toString());
            }
            ret.put("nombre", nombre);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("No se pudo guardar el archivo: " + e.getMessage());
        }
    }

    /** Abre el menú de Android para compartir un archivo (WhatsApp, Drive, correo…). */
    @PluginMethod
    public void compartir(PluginCall call) {
        String nombre = limpiarNombre(call.getString("nombre", "archivo"));
        String mime = call.getString("mime", "application/octet-stream");
        String datos = call.getString("datos");
        if (datos == null) {
            call.reject("No hay datos para compartir.");
            return;
        }
        try {
            File dir = new File(getContext().getCacheDir(), "compartir");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("no se pudo crear la carpeta");
            File file = new File(dir, nombre);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(datos, Base64.DEFAULT));
            }
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uriDe(file));
            send.putExtra(Intent.EXTRA_SUBJECT, nombre);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Compartir " + nombre);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo compartir el archivo: " + e.getMessage());
        }
    }

    /**
     * Imprime lo que muestra la página (con sus estilos de impresión) usando
     * el servicio de impresión de Android, que también permite guardar como PDF.
     * ancho/alto: tamaño de la página en milímetros (opcional).
     */
    @PluginMethod
    public void imprimir(PluginCall call) {
        final String titulo = call.getString("titulo", "Lector de Hojas");
        final Double ancho = call.getDouble("ancho");
        final Double alto = call.getDouble("alto");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                WebView webView = getBridge().getWebView();
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(titulo);
                PrintAttributes.Builder attrs = new PrintAttributes.Builder();
                if (ancho != null && alto != null && ancho > 0 && alto > 0) {
                    attrs.setMediaSize(tamano(ancho, alto));
                }
                pm.print(titulo, adapter, attrs.build());
                call.resolve();
            } catch (Exception e) {
                call.reject("No se pudo imprimir: " + e.getMessage());
            }
        });
    }

    /** Tamaño de papel conocido (carta, A4, oficio) según las medidas, en vertical u horizontal. */
    private PrintAttributes.MediaSize tamano(double anchoMm, double altoMm) {
        boolean horizontal = anchoMm > altoMm;
        double corto = Math.min(anchoMm, altoMm);
        double largo = Math.max(anchoMm, altoMm);
        PrintAttributes.MediaSize m;
        if (Math.abs(corto - 210) < 3 && Math.abs(largo - 297) < 3) m = PrintAttributes.MediaSize.ISO_A4;
        else if (Math.abs(corto - 215.9) < 3 && Math.abs(largo - 279.4) < 3) m = PrintAttributes.MediaSize.NA_LETTER;
        else {
            int w = (int) Math.round(corto / 25.4 * 1000);
            int h = (int) Math.round(largo / 25.4 * 1000);
            String id = Math.abs(largo - 330.2) < 3 ? "OFICIO" : "CUSTOM_" + w + "x" + h;
            String label = Math.abs(largo - 330.2) < 3 ? "Oficio" : Math.round(corto) + " × " + Math.round(largo) + " mm";
            m = new PrintAttributes.MediaSize(id, label, w, h);
        }
        return horizontal ? m.asLandscape() : m.asPortrait();
    }

    private Uri uriDe(File file) {
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
    }

    private static String limpiarNombre(String nombre) {
        String n = nombre.replaceAll("[\\\\/:*?\"<>|\\n\\r\\t]", "_").trim();
        return n.isEmpty() ? "archivo" : n;
    }
}
