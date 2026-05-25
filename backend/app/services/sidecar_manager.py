import os
import asyncio
import subprocess
import httpx
from ..config import SIDECAR_PORT, SIDECAR_URL


class SidecarManager:
    def __init__(self):
        self.process: subprocess.Popen | None = None

    @staticmethod
    def _find_npx(env: dict) -> str:
        """Find npx executable from PATH (Windows .cmd / .exe or Linux plain)."""
        path_str = env.get("PATH", "")
        path_dirs = path_str.split(";") if ";" in path_str else path_str.split(":")
        for d in path_dirs:
            for candidate in ("npx.cmd", "npx.exe", "npx"):
                full = os.path.join(d, candidate)
                if os.path.isfile(full):
                    return full
        # Fallback: try common locations
        for d in ["E:\\nodejs", "C:\\Program Files\\nodejs", "/usr/local/bin", "/usr/bin"]:
            for candidate in ("npx.cmd", "npx.exe", "npx"):
                full = os.path.join(d, candidate)
                if os.path.isfile(full):
                    return full
        return "npx"  # Last resort

    async def start(self):
        env = os.environ.copy()
        env["PORT"] = str(SIDECAR_PORT)
        # Ensure Node.js is in PATH
        node_paths = ["E:\\nodejs", "E:\\nodejs\\node_global"]
        current_path = env.get("PATH", "")
        for np in node_paths:
            if np not in current_path:
                current_path = np + ";" + current_path
        env["PATH"] = current_path

        npx_path = self._find_npx(env)
        self.process = subprocess.Popen(
            [npx_path, "@neteasecloudmusicapienhanced/api"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        )

        for _ in range(30):
            try:
                async with httpx.AsyncClient() as client:
                    r = await client.get(f"{SIDECAR_URL}/", timeout=2)
                    if r.status_code == 200:
                        return True
            except Exception:
                pass
            await asyncio.sleep(1)

        # Collect stderr for diagnostics
        _, stderr = self.process.communicate(timeout=1)
        err_msg = stderr.decode(errors="replace") if stderr else "no output"
        raise RuntimeError(f"NetEase sidecar failed to start: {err_msg[:500]}")

    async def stop(self):
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()


sidecar = SidecarManager()
