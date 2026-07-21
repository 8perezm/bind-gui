$TTL    86400

@       IN      SOA     ns1.tail.esuyo.com. admin.tail.esuyo.com. (
                        2026072190      ; Serial
                        3600            ; Refresh
                        1800            ; Retry
                        604800          ; Expire
                        86400 )         ; Minimum TTL
