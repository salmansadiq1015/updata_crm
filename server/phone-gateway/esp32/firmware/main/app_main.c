// Updata ESP32 HFP bridge firmware entry point. See docs/paired-phone/ESP32-FIRMWARE.md.

#include "nvs_flash.h"

#include "bridge.h"

void app_main(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);
    bridge_start();
}
