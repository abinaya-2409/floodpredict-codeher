package com.floodypredict.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BluetoothChatPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
