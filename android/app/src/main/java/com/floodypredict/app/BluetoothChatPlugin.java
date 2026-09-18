package com.floodypredict.app;

import android.Manifest;
import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * BluetoothChatPlugin – Capacitor Native Android Plugin
 * Implements dual-mode BLE Peripheral advertising + GATT Server hosting
 * and Bluetooth Classic RFCOMM SPP socket P2P direct communication.
 *
 * Service UUID: 0000fd01-0000-1000-8000-00805f9b34fb (FloodyPredict)
 * TX Characteristic: 0000fd02-0000-1000-8000-00805f9b34fb
 * RX Characteristic: 0000fd03-0000-1000-8000-00805f9b34fb
 *
 * Architecture:
 * 1. BLE advertises FloodyPredict Service UUID so nearby devices can discover.
 * 2. GATT Server: Remote Central connects, writes to TX characteristic to send data.
 * 3. RFCOMM fallback for sustained streaming if BLE MTU is insufficient.
 * 4. All received raw packet chunks forwarded to JS via "onPacketReceived" event.
 */
@CapacitorPlugin(
    name = "BluetoothChat",
    permissions = {
        @Permission(alias = "bluetooth", strings = {
            Manifest.permission.BLUETOOTH,
            Manifest.permission.BLUETOOTH_ADMIN
        }),
        @Permission(alias = "bluetoothScan", strings = {
            Manifest.permission.BLUETOOTH_SCAN
        }),
        @Permission(alias = "bluetoothConnect", strings = {
            Manifest.permission.BLUETOOTH_CONNECT
        }),
        @Permission(alias = "bluetoothAdvertise", strings = {
            Manifest.permission.BLUETOOTH_ADVERTISE
        }),
        @Permission(alias = "location", strings = {
            Manifest.permission.ACCESS_FINE_LOCATION
        })
    }
)
public class BluetoothChatPlugin extends Plugin {

    // FloodyPredict BLE Service & Characteristic UUIDs
    private static final UUID SERVICE_UUID = UUID.fromString("0000fd01-0000-1000-8000-00805f9b34fb");
    private static final UUID CHAR_TX_UUID = UUID.fromString("0000fd02-0000-1000-8000-00805f9b34fb");
    private static final UUID CHAR_RX_UUID = UUID.fromString("0000fd03-0000-1000-8000-00805f9b34fb");
    private static final UUID CCCD_UUID    = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bleScanner;
    private BluetoothLeAdvertiser bleAdvertiser;
    private BluetoothGattServer gattServer;
    private BluetoothManager bluetoothManager;
    private BluetoothGatt connectedGatt;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean isScanning = false;
    private boolean isAdvertising = false;

    // RFCOMM Bluetooth Classic socket support
    private BluetoothServerSocket rfcommServerSocket;
    private BluetoothSocket rfcommSocket;
    private InputStream rfcommInputStream;
    private OutputStream rfcommOutputStream;

    @Override
    public void load() {
        bluetoothManager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        if (bluetoothManager != null) {
            bluetoothAdapter = bluetoothManager.getAdapter();
        }
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        boolean allGranted = hasAllBluetoothPermissions();
        result.put("status", allGranted ? "granted" : "denied");
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        saveCall(call);
        List<String> perms = new ArrayList<>();
        perms.add(Manifest.permission.BLUETOOTH_SCAN);
        perms.add(Manifest.permission.BLUETOOTH_CONNECT);
        perms.add(Manifest.permission.BLUETOOTH_ADVERTISE);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        requestPermissionForAliases(perms.toArray(new String[0]), call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("status", hasAllBluetoothPermissions() ? "granted" : "denied");
        call.resolve(result);
    }

    @PluginMethod
    public void isBluetoothEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", bluetoothAdapter != null && bluetoothAdapter.isEnabled());
        call.resolve(result);
    }

    /**
     * Start BLE Advertisement so nearby FloodyPredict devices can discover this phone
     */
    @PluginMethod
    public void startAdvertising(PluginCall call) {
        String deviceName = call.getString("deviceName", "FloodyPredict");

        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth not enabled");
            return;
        }

        if (!hasPermission(Manifest.permission.BLUETOOTH_ADVERTISE)) {
            call.reject("BLUETOOTH_ADVERTISE permission not granted");
            return;
        }

        // Set friendly device name
        bluetoothAdapter.setName(deviceName);

        // Start GATT Server
        startGattServer();

        // Start BLE advertising
        bleAdvertiser = bluetoothAdapter.getBluetoothLeAdvertiser();
        if (bleAdvertiser == null) {
            call.reject("BLE advertising not supported on this device");
            return;
        }

        AdvertiseSettings settings = new AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .build();

        AdvertiseData data = new AdvertiseData.Builder()
            .setIncludeDeviceName(true)
            .addServiceUuid(new ParcelUuid(SERVICE_UUID))
            .build();

        bleAdvertiser.startAdvertising(settings, data, advertiseCallback);
        isAdvertising = true;

        // Also open RFCOMM server socket for Classic BT fallback
        startRfcommServer();

        call.resolve();
    }

    /**
     * Start BLE scan for nearby FloodyPredict devices
     */
    @PluginMethod
    public void startScan(PluginCall call) {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth not enabled");
            return;
        }

        if (!hasPermission(Manifest.permission.BLUETOOTH_SCAN)) {
            call.reject("BLUETOOTH_SCAN permission not granted");
            return;
        }

        bleScanner = bluetoothAdapter.getBluetoothLeScanner();
        if (bleScanner == null) {
            call.reject("BLE scanner not available");
            return;
        }

        // Filter specifically for FloodyPredict Service UUID
        ScanFilter filter = new ScanFilter.Builder()
            .setServiceUuid(new ParcelUuid(SERVICE_UUID))
            .build();

        ScanSettings scanSettings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build();

        isScanning = true;
        bleScanner.startScan(Collections.singletonList(filter), scanSettings, scanCallback);
        call.resolve();
    }

    /**
     * Stop BLE scan
     */
    @PluginMethod
    public void stopScan(PluginCall call) {
        if (bleScanner != null && isScanning) {
            if (hasPermission(Manifest.permission.BLUETOOTH_SCAN)) {
                bleScanner.stopScan(scanCallback);
            }
            isScanning = false;
        }
        call.resolve();
    }

    /**
     * Connect to a discovered BLE device by MAC address
     */
    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        if (address == null || address.isEmpty()) {
            call.reject("Device address required");
            return;
        }

        if (!hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) {
            call.reject("BLUETOOTH_CONNECT permission not granted");
            return;
        }

        BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
        if (device == null) {
            call.reject("Device not found");
            return;
        }

        // First try BLE GATT connection
        connectedGatt = device.connectGatt(getContext(), false, gattCallback, BluetoothDevice.TRANSPORT_LE);

        // Emit connecting state to JS
        JSObject connState = new JSObject();
        connState.put("state", "connecting");
        connState.put("address", address);
        notifyListeners("onConnectionStateChanged", connState);

        call.resolve();
    }

    /**
     * Disconnect from current BLE peer
     */
    @PluginMethod
    public void disconnect(PluginCall call) {
        if (connectedGatt != null) {
            if (hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) {
                connectedGatt.disconnect();
                connectedGatt.close();
            }
            connectedGatt = null;
        }
        closeRfcommSocket();

        JSObject connState = new JSObject();
        connState.put("state", "disconnected");
        notifyListeners("onConnectionStateChanged", connState);

        call.resolve();
    }

    /**
     * Write a raw BLE packet string chunk to connected peer via GATT Write
     */
    @PluginMethod
    public void writePacket(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("No data provided");
            return;
        }

        if (!hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) {
            call.reject("BLUETOOTH_CONNECT permission not granted");
            return;
        }

        // Try RFCOMM first (sustained streaming), fall back to GATT
        if (rfcommOutputStream != null) {
            executor.execute(() -> {
                try {
                    byte[] bytes = (data + "\n").getBytes("UTF-8");
                    rfcommOutputStream.write(bytes);
                    mainHandler.post(call::resolve);
                } catch (IOException e) {
                    mainHandler.post(() -> call.reject("RFCOMM write failed: " + e.getMessage()));
                }
            });
            return;
        }

        // GATT Write
        if (connectedGatt == null) {
            call.reject("Not connected to any BLE peer");
            return;
        }

        BluetoothGattService service = connectedGatt.getService(SERVICE_UUID);
        if (service == null) {
            call.reject("FloodyPredict GATT service not found on peer");
            return;
        }

        BluetoothGattCharacteristic txChar = service.getCharacteristic(CHAR_TX_UUID);
        if (txChar == null) {
            call.reject("TX characteristic not found");
            return;
        }

        byte[] bytes;
        try {
            bytes = data.getBytes("UTF-8");
        } catch (Exception e) {
            call.reject("UTF-8 encoding failed");
            return;
        }

        txChar.setValue(bytes);
        txChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
        boolean success = connectedGatt.writeCharacteristic(txChar);

        if (success) {
            call.resolve();
        } else {
            call.reject("GATT write failed");
        }
    }

    // -------------------------------------------------------------------------
    // BLE Scan Callback
    // -------------------------------------------------------------------------
    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            String address = device.getAddress();
            String name = "FloodyPredict User";
            try {
                name = device.getName() != null ? device.getName() : "FloodyPredict User";
            } catch (Exception ignored) {}

            JSObject discovered = new JSObject();
            discovered.put("address", address);
            discovered.put("name", name);
            discovered.put("rssi", result.getRssi());
            notifyListeners("onDeviceDiscovered", discovered);
        }

        @Override
        public void onScanFailed(int errorCode) {
            JSObject err = new JSObject();
            err.put("error", "Scan failed with code: " + errorCode);
            notifyListeners("onScanError", err);
        }
    };

    // -------------------------------------------------------------------------
    // BLE Advertise Callback
    // -------------------------------------------------------------------------
    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settingsInEffect) {
            // Advertising started
        }

        @Override
        public void onStartFailure(int errorCode) {
            JSObject err = new JSObject();
            err.put("error", "Advertising failed with code: " + errorCode);
            notifyListeners("onAdvertiseError", err);
        }
    };

    // -------------------------------------------------------------------------
    // BLE GATT Client Callback (when we connect to a remote GATT Server)
    // -------------------------------------------------------------------------
    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            JSObject connEvent = new JSObject();
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                connEvent.put("state", "connected");
                connEvent.put("address", gatt.getDevice().getAddress());
                notifyListeners("onConnectionStateChanged", connEvent);

                // Discover services
                if (hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) {
                    gatt.discoverServices();
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connEvent.put("state", "disconnected");
                connEvent.put("address", gatt.getDevice().getAddress());
                notifyListeners("onConnectionStateChanged", connEvent);
                gatt.close();
                connectedGatt = null;
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                BluetoothGattService service = gatt.getService(SERVICE_UUID);
                if (service != null) {
                    // Enable notifications on RX characteristic
                    BluetoothGattCharacteristic rxChar = service.getCharacteristic(CHAR_RX_UUID);
                    if (rxChar != null) {
                        gatt.setCharacteristicNotification(rxChar, true);
                        BluetoothGattDescriptor cccd = rxChar.getDescriptor(CCCD_UUID);
                        if (cccd != null) {
                            cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                            if (hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) {
                                gatt.writeDescriptor(cccd);
                            }
                        }
                    }
                }
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            if (CHAR_RX_UUID.equals(characteristic.getUuid())) {
                String data = new String(characteristic.getValue());
                JSObject packet = new JSObject();
                packet.put("data", data);
                notifyListeners("onPacketReceived", packet);
            }
        }
    };

    // -------------------------------------------------------------------------
    // BLE GATT Server (for incoming Central connections)
    // -------------------------------------------------------------------------
    private void startGattServer() {
        if (!hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) return;

        gattServer = bluetoothManager.openGattServer(getContext(), new BluetoothGattServerCallback() {
            @Override
            public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
                JSObject connEvent = new JSObject();
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    connEvent.put("state", "connected");
                    connEvent.put("address", device.getAddress());
                } else {
                    connEvent.put("state", "disconnected");
                    connEvent.put("address", device.getAddress());
                }
                notifyListeners("onConnectionStateChanged", connEvent);
            }

            @Override
            public void onCharacteristicWriteRequest(BluetoothDevice device,
                int requestId, BluetoothGattCharacteristic characteristic,
                boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
                // Incoming data from remote Central writing to TX characteristic
                if (CHAR_TX_UUID.equals(characteristic.getUuid())) {
                    String data = new String(value);
                    JSObject packet = new JSObject();
                    packet.put("data", data);
                    notifyListeners("onPacketReceived", packet);
                }
                if (responseNeeded && gattServer != null) {
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null);
                }
            }
        });

        // Register FloodyPredict Service
        BluetoothGattService service = new BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY);

        // TX characteristic (remote writes to us)
        BluetoothGattCharacteristic txChar = new BluetoothGattCharacteristic(CHAR_TX_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE);

        // RX characteristic (we notify remote of new data)
        BluetoothGattCharacteristic rxChar = new BluetoothGattCharacteristic(CHAR_RX_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ);
        BluetoothGattDescriptor cccd = new BluetoothGattDescriptor(CCCD_UUID,
            BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE);
        rxChar.addDescriptor(cccd);

        service.addCharacteristic(txChar);
        service.addCharacteristic(rxChar);
        gattServer.addService(service);
    }

    // -------------------------------------------------------------------------
    // RFCOMM Classic Bluetooth Server Socket (Fallback for sustained streaming)
    // -------------------------------------------------------------------------
    private void startRfcommServer() {
        executor.execute(() -> {
            try {
                if (!hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) return;
                rfcommServerSocket = bluetoothAdapter.listenUsingInsecureRfcommWithServiceRecord(
                    "FloodyPredict", SERVICE_UUID);
                while (true) {
                    BluetoothSocket socket = rfcommServerSocket.accept();
                    rfcommSocket = socket;
                    rfcommInputStream = socket.getInputStream();
                    rfcommOutputStream = socket.getOutputStream();

                    // Notify JS of incoming RFCOMM connection
                    JSObject connState = new JSObject();
                    connState.put("state", "connected");
                    connState.put("address", socket.getRemoteDevice().getAddress());
                    notifyListeners("onConnectionStateChanged", connState);

                    // Start reading from this socket
                    readFromRfcommSocket();
                    break;
                }
            } catch (IOException e) {
                // Server closed or error
            }
        });
    }

    private void readFromRfcommSocket() {
        executor.execute(() -> {
            byte[] buffer = new byte[1024];
            StringBuilder lineBuffer = new StringBuilder();
            try {
                while (true) {
                    int bytesRead = rfcommInputStream.read(buffer);
                    if (bytesRead < 0) break;
                    String chunk = new String(buffer, 0, bytesRead, "UTF-8");
                    lineBuffer.append(chunk);

                    // Process complete newline-delimited messages
                    int newlineIdx;
                    while ((newlineIdx = lineBuffer.indexOf("\n")) >= 0) {
                        String line = lineBuffer.substring(0, newlineIdx).trim();
                        lineBuffer.delete(0, newlineIdx + 1);
                        if (!line.isEmpty()) {
                            JSObject packet = new JSObject();
                            packet.put("data", line);
                            notifyListeners("onPacketReceived", packet);
                        }
                    }
                }
            } catch (IOException e) {
                // Connection lost
                JSObject connState = new JSObject();
                connState.put("state", "disconnected");
                notifyListeners("onConnectionStateChanged", connState);
            }
        });
    }

    private void closeRfcommSocket() {
        try {
            if (rfcommInputStream != null) rfcommInputStream.close();
            if (rfcommOutputStream != null) rfcommOutputStream.close();
            if (rfcommSocket != null) rfcommSocket.close();
        } catch (IOException ignored) {}
        rfcommInputStream = null;
        rfcommOutputStream = null;
        rfcommSocket = null;
    }

    private boolean hasAllBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return hasPermission(Manifest.permission.BLUETOOTH_SCAN) &&
                   hasPermission(Manifest.permission.BLUETOOTH_CONNECT) &&
                   hasPermission(Manifest.permission.BLUETOOTH_ADVERTISE);
        }
        return hasPermission(Manifest.permission.BLUETOOTH) &&
               hasPermission(Manifest.permission.BLUETOOTH_ADMIN) &&
               hasPermission(Manifest.permission.ACCESS_FINE_LOCATION);
    }

    @Override
    protected void handleOnDestroy() {
        isScanning = false;
        isAdvertising = false;
        if (bleAdvertiser != null) {
            try {
                bleAdvertiser.stopAdvertising(advertiseCallback);
            } catch (Exception ignored) {}
        }
        if (bleScanner != null) {
            try {
                bleScanner.stopScan(scanCallback);
            } catch (Exception ignored) {}
        }
        if (connectedGatt != null) {
            try {
                connectedGatt.close();
            } catch (Exception ignored) {}
        }
        if (gattServer != null) {
            try {
                gattServer.close();
            } catch (Exception ignored) {}
        }
        closeRfcommSocket();
        executor.shutdownNow();
    }
}
