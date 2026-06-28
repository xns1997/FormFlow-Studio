import express from 'express';
import cors from 'cors';
import { projectRouter } from './routes/projects';
import { fileRouter } from './routes/files';
import { dataRouter } from './routes/data';
import { historyRouter } from './routes/history';
import { workflowRouter } from './routes/workflows';
import { behaviorRouter } from './routes/behaviors';
import { describeRouter } from './routes/describe';
import { configRouter } from './routes/configs';
import mlRouter from './routes/ml';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/projects', projectRouter);
app.use('/api/files', fileRouter);
app.use('/api/data', dataRouter);
app.use('/api/history', historyRouter);
app.use('/api/workflows', workflowRouter);
app.use('/api/behaviors', behaviorRouter);
app.use('/api/describe', describeRouter);
app.use('/api/configs', configRouter);
app.use('/api/ml', mlRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`FormFlow Server running on http://localhost:${PORT}`);
});

export default app;
