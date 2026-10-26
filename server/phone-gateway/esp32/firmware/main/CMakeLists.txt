idf_component_register(SRCS "app_main.c" "bridge.c" "proto.c" "dialauth.c" "ring.c"
                       INCLUDE_DIRS "."
                       PRIV_REQUIRES bt nvs_flash esp_driver_uart esp_driver_gpio esp_timer esp_app_format)
