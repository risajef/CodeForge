#!/bin/sh
set -eu
export ISE_EIFFEL=/opt/eiffel ISE_LIBRARY=/ ISE_PLATFORM=linux-x86-64
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
mount -t proc proc /proc
mount -t sysfs sysfs /sys
mount -t tmpfs -o mode=1777 tmpfs /tmp
mount -t tmpfs tmpfs /run
mount -t tmpfs -o uid=1000,gid=1000 tmpfs /workspace
mkdir -p /dev/shm
mount -t tmpfs -o mode=1777 tmpfs /dev/shm
stty -echo
cp /opt/codeforge/Ace.ecf /workspace/
cd /workspace
printf 'CF_READY\n'
while IFS=' ' read -r op value; do
    status=0
    case "$op" in
        BEGIN) : > /tmp/source ;;
        CHUNK) printf '%s' "$value" | base64 -d >> /tmp/source || status=$? ;;
        SAVE|REMOVE)
            case "$value" in ''|.*|*[!a-zA-Z0-9_.-]*) status=1 ;; esac
            case "$value" in *.e) ;; *) status=1 ;; esac
            if [ "$status" -eq 0 ]; then
                if [ "$op" = REMOVE ]; then
                    if [ -f "$value" ]; then unlink "$value" || status=$?; fi
                elif ! cmp -s /tmp/source "$value"; then
                    install -o coderunner -g coderunner -m 0644 /tmp/source "$value" || status=$?
                fi
            fi
            ;;
        VERIFY)
            runuser -u coderunner -- apb -batch -autoproof -html > /tmp/proof || status=$?
            printf 'CF_RESULT '
            base64 -w0 /tmp/proof
            printf '\n'
            ;;
        *) status=1 ;;
    esac
    printf 'CF_ACK %s\n' "$status"
done
