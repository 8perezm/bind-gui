; ── Forward Zone Template ────────────────────────────────────────────
; Copy this file to create zone files for your domains.
; Name it db.<your-domain> (e.g. db.example.com) and update the
; zone declaration in named.conf.local.
;
; Replace all occurrences of "example.com" with your actual domain
; and update the serial number whenever you make a change.
;
; ── Variables ────────────────────────────────────────────────────────
; NS — name server hostname (usually the same machine)
; SIP — IP address of this DNS server

$TTL    86400

; ── SOA Record ──────────────────────────────────────────────────────
; The Start of Authority record declares this server as authoritative
; for the zone.  Format:
;   <domain>  IN  SOA  <primary-ns>  <admin-email>  ( ... )
;
; Note: the admin email uses a dot (.) instead of @ — so
;       admin.example.com  means  admin@example.com.

@       IN      SOA     ns1.example.com. admin.example.com. (
                        2024010101      ; Serial (YYYYMMDDNN)
                                        ; Increment every time you edit
                        3600            ; Refresh  — slave refresh interval
                        1800            ; Retry    — retry after failed refresh
                        604800          ; Expire   — slave gives up after this
                        86400 )         ; Minimum TTL (negative caching)

; ── Name Servers ────────────────────────────────────────────────────
; Declare the authoritative name servers for this domain.

@       IN      NS      ns1.example.com.

; ── A / AAAA Records (hostname → IP) ───────────────────────────────
; Map hostnames to IPv4 (A) or IPv6 (AAAA) addresses.

ns1     IN      A       192.168.1.10    ; This DNS server
@       IN      A       192.168.1.10    ; example.com itself
www     IN      A       192.168.1.10    ; Web server
mail    IN      A       192.168.1.20    ; Mail server

; ── CNAME Records (alias → hostname) ───────────────────────────────
; Create additional names that point to existing A records.

;ftp     IN      CNAME   www             ; ftp.example.com → www.example.com

; ── MX Records (mail exchange) ──────────────────────────────────────
; Declare which server handles email for this domain.
; The number is the priority — lower = higher priority.

@       IN      MX      10      mail.example.com.
;@      IN      MX      20      backup-mail.example.com.

; ── TXT Records ─────────────────────────────────────────────────────
; Used for SPF, DKIM, DMARC, and other verification systems.

@       IN      TXT     "v=spf1 mx ~all"
;mail    IN      TXT     "v=DKIM1; k=rsa; p=..."

; ── PTR Records ─────────────────────────────────────────────────────
; Reverse DNS (IP → hostname) goes in the separate reverse zone file
; (see db.192.168.1 / db.192.168.5 for an example).
