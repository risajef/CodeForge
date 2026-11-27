#!/bin/sh
set -eu
export ISE_EIFFEL=/opt/eiffel ISE_LIBRARY=/opt/eiffel ISE_PLATFORM=linux-x86-64
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
mount -t proc proc /proc
mount -t sysfs sysfs /sys
mount -t tmpfs -o mode=1777 tmpfs /tmp
mount -t tmpfs tmpfs /run
mount -t tmpfs -o uid=1000,gid=1000 tmpfs /workspace
mkdir -p /dev/shm
mount -t tmpfs -o mode=1777 tmpfs /dev/shm
stty -echo
for language in eiffel python c cpp java; do
    install -d -o coderunner -g coderunner "/workspace/$language"
done

run_job() {
    runuser -u coderunner -- timeout -k 3 "$1" /usr/local/bin/codeforge-run "$2" "$3" "$4" \
        </dev/null >/run/codeforge-output 2>&1 &
    child=$!
    printf '%s\n' "$child" >/run/codeforge-pid
    result=0
    wait "$child" || result=$?
    printf '%s\n' "$result" >/run/codeforge-exit
}

cd /workspace/eiffel
language=eiffel
printf 'CF_READY\n'
while IFS=' ' read -r op value operation seconds main; do
    status=0
    case "$op" in
        LANGUAGE)
            case "$value" in
                eiffel|python|c|cpp|java) cd "/workspace/$value"; language=$value ;;
                *) status=1 ;;
            esac
            ;;
        BEGIN) : > /run/codeforge-source ;;
        CHUNK) printf '%s' "$value" | base64 -d >> /run/codeforge-source || status=$? ;;
        SAVE|REMOVE)
            case "$value" in ''|[!a-zA-Z0-9_]*|*[!a-zA-Z0-9_.-]*) status=1 ;; esac
            if [ "$status" -eq 0 ]; then
                if [ "$op" = REMOVE ]; then
                    rm -f -- "$value" || status=$?
                elif ! cmp -s /run/codeforge-source "$value"; then
                    install -o coderunner -g coderunner -m 0644 /run/codeforge-source "$value" || status=$?
                fi
            fi
            ;;
        START)
            # START carries language, operation, timeout and main filename.
            if [ "$value" != "$language" ] || [ -z "$main" ] || [ -e /run/codeforge-pid ]; then
                status=1
            else
                run_job "$seconds" "$language" "$operation" "$main" &
                while [ ! -s /run/codeforge-pid ]; do sleep 0.01; done
            fi
            ;;
        RESULT)
            if [ -s /run/codeforge-exit ]; then
                printf 'CF_DONE %s ' "$(cat /run/codeforge-exit)"
                head -c 524288 /run/codeforge-output | base64 -w0
                printf '\n'
                rm -f /run/codeforge-exit /run/codeforge-pid
            fi
            ;;
        CANCEL)
            if [ -s /run/codeforge-pid ] && [ ! -s /run/codeforge-exit ]; then
                kill -TERM "$(cat /run/codeforge-pid)" 2>/dev/null || :
            fi
            ;;
        *) status=1 ;;
    esac
    printf 'CF_ACK %s\n' "$status"
done
