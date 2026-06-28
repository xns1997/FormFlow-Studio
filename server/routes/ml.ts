import { Router } from 'express';
import { join } from 'path';
import { execSync } from 'child_process';

const router = Router();
const PYTHON = join(import.meta.dirname, '..', '..', 'venv', 'bin', 'python3');
const ML_SCRIPT = join(import.meta.dirname, '..', '..', 'python', 'ml_engine.py');

function runML(command: string, args: Record<string, unknown> = {}) {
  try {
    const argsJson = JSON.stringify(args).replace(/'/g, "'\\''");
    const cmd = `${PYTHON} ${ML_SCRIPT} ${command} '${argsJson}'`;
    const output = execSync(cmd, { timeout: 30000, maxBuffer: 50 * 1024 * 1024 }).toString();
    return JSON.parse(output);
  } catch (e: any) {
    return { error: e.message };
  }
}

router.post('/:command', (req, res) => {
  try {
    const { command } = req.params;
    const result = runML(command, req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
