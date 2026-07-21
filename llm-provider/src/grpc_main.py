from __future__ import annotations

import signal

from .grpc_server import create_server


def main() -> None:
    server = create_server()
    server.start()

    def stop(*_args):
        server.stop(grace=5)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    server.wait_for_termination()


if __name__ == "__main__":
    main()
