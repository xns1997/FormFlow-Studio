from __future__ import annotations

import signal
import threading

from .config import settings
from .grpc_server import create_server
from .http_app import app


def main() -> None:
    grpc_server = create_server()
    grpc_server.start()
    stop = threading.Event()

    def shutdown(*_args):
        grpc_server.stop(grace=5)
        stop.set()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    http = threading.Thread(target=lambda: app.run(host=settings.http_host, port=settings.http_port, threaded=True, use_reloader=False), daemon=True)
    http.start()
    stop.wait()


if __name__ == "__main__":
    main()
