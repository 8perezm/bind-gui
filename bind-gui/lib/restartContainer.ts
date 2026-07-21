import http from "node:http";

const DOCKER_SOCKET_PATH = "/var/run/docker.sock";

/**
 * Restart a Docker container by name using the Docker Engine API via Unix socket.
 * Returns true if the restart was successful, false otherwise.
 */
export async function restartDockerContainer(
  containerName: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        socketPath: DOCKER_SOCKET_PATH,
        path: `/containers/${encodeURIComponent(containerName)}/restart`,
        method: "POST",
        timeout: 30_000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode === 204 || res.statusCode === 200) {
            resolve({ success: true });
          } else {
            resolve({
              success: false,
              error: `Docker API returned status ${res.statusCode}: ${body}`,
            });
          }
        });
      }
    );

    req.on("error", (err) => {
      resolve({
        success: false,
        error: `Failed to connect to Docker socket: ${err.message}`,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ success: false, error: "Docker API request timed out" });
    });

    req.end();
  });
}
