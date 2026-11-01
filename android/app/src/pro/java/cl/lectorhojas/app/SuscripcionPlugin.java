package cl.lectorhojas.app;

import android.content.Intent;
import android.net.Uri;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.List;

/**
 * CorrigeYa Plus: suscripción mensual con Google Play (sólo en la app Pro).
 * La página la usa desde js/pro/plus.js:
 *   estado()    ¿hay una suscripción activa? y su precio en Google Play;
 *   comprar()   abre el pago de Google Play;
 *   gestionar() abre la página de Google Play para cambiar o cancelar.
 * La suscripción se crea en Play Console con el id de js/lanzamiento.js.
 */
@CapacitorPlugin(name = "Suscripcion")
public class SuscripcionPlugin extends Plugin implements PurchasesUpdatedListener {

    private static final String PRODUCTO = "corrigeya_plus";

    private BillingClient client;
    private PluginCall compraPendiente;

    private interface ConDetalles {
        void listo(ProductDetails detalles, String precio);
    }

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    /** Conecta con Google Play (si hace falta) y sigue. */
    private void conectar(final PluginCall call, final Runnable seguir) {
        if (client.isReady()) {
            seguir.run();
            return;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) seguir.run();
                else call.reject("Google Play no está disponible en este teléfono (" + r.getResponseCode() + ").");
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Se vuelve a conectar en la próxima llamada.
            }
        });
    }

    /** Detalles de la suscripción y su precio («$1.990»), o null si no existe en Play Console. */
    private void detalles(String producto, final ConDetalles fin) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(producto)
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()))
            .build();
        client.queryProductDetailsAsync(params, (r, lista) -> {
            ProductDetails d = lista != null && !lista.isEmpty() ? lista.get(0) : null;
            String precio = "";
            if (d != null && d.getSubscriptionOfferDetails() != null && !d.getSubscriptionOfferDetails().isEmpty()) {
                List<ProductDetails.PricingPhase> fases = d.getSubscriptionOfferDetails().get(0).getPricingPhases().getPricingPhaseList();
                if (!fases.isEmpty()) precio = fases.get(fases.size() - 1).getFormattedPrice();
            }
            fin.listo(d, precio);
        });
    }

    @PluginMethod
    public void estado(final PluginCall call) {
        final String producto = call.getString("producto", PRODUCTO);
        conectar(call, () -> client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (r, compras) -> {
                boolean activa = false;
                if (compras != null) {
                    for (Purchase p : compras) {
                        if (p.getProducts().contains(producto) && p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                            activa = true;
                            reconocer(p);
                        }
                    }
                }
                final boolean esActiva = activa;
                detalles(producto, (d, precio) -> {
                    JSObject out = new JSObject();
                    out.put("activa", esActiva);
                    out.put("precio", precio);
                    out.put("disponible", d != null);
                    call.resolve(out);
                });
            }));
    }

    @PluginMethod
    public void comprar(final PluginCall call) {
        final String producto = call.getString("producto", PRODUCTO);
        conectar(call, () -> detalles(producto, (d, precio) -> {
            if (d == null || d.getSubscriptionOfferDetails() == null || d.getSubscriptionOfferDetails().isEmpty()) {
                call.reject("La suscripción todavía no está disponible en Google Play.");
                return;
            }
            String oferta = d.getSubscriptionOfferDetails().get(0).getOfferToken();
            final BillingFlowParams params = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(d)
                        .setOfferToken(oferta)
                        .build()))
                .build();
            compraPendiente = call;
            getActivity().runOnUiThread(() -> {
                BillingResult r = client.launchBillingFlow(getActivity(), params);
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    terminarCompra(false, "No se pudo abrir el pago de Google Play (" + r.getResponseCode() + ").");
                }
            });
        }));
    }

    @PluginMethod
    public void gestionar(PluginCall call) {
        String producto = call.getString("producto", PRODUCTO);
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(
            "https://play.google.com/store/account/subscriptions?sku=" + producto + "&package=" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> compras) {
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && compras != null) {
            boolean activa = false;
            for (Purchase p : compras) {
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    activa = true;
                    reconocer(p);
                }
            }
            terminarCompra(activa, activa ? null : "El pago quedó pendiente: Plus se activará cuando Google Play lo confirme.");
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            terminarCompra(true, null);
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            terminarCompra(false, null);
        } else {
            terminarCompra(false, "No se pudo completar el pago (" + code + ").");
        }
    }

    private void terminarCompra(boolean activa, String error) {
        PluginCall call = compraPendiente;
        compraPendiente = null;
        if (call == null) return;
        JSObject out = new JSObject();
        out.put("activa", activa);
        if (error != null) out.put("error", error);
        call.resolve(out);
    }

    /** Google Play reembolsa las compras que no se confirman en 3 días. */
    private void reconocer(Purchase p) {
        if (p.isAcknowledged()) return;
        client.acknowledgePurchase(
            AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(),
            r -> { });
    }
}
