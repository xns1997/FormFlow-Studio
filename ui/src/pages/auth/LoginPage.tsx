import { useState } from 'react';
import { Button, Card, Form, Input, Segmented, Typography, message } from 'antd';
import { Navigate, useNavigate } from 'react-router-dom';
import { getSession, login, register } from '../../services/io/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  if (getSession()) return <Navigate to="/projects" replace />;

  async function submit(values: { username: string; password: string }) {
    setLoading(true);
    try {
      await (mode === 'login' ? login(values.username, values.password) : register(values.username, values.password));
      navigate('/projects', { replace: true });
    } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  }

  return <div className="auth-page">
    <Card className="auth-card">
      <Typography.Title level={3}>FormFlow Studio</Typography.Title>
      <Segmented block value={mode} onChange={(value) => setMode(value as typeof mode)} options={[{ label: '登录', value: 'login' }, { label: '初始化管理员', value: 'register' }]} />
      <Form layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item name="username" label="用户名" rules={[{ required: true }, { min: 3 }]}><Input autoComplete="username" /></Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true }, { min: 8 }]}><Input.Password autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Form.Item>
        <Button block type="primary" htmlType="submit" loading={loading}>{mode === 'login' ? '登录' : '创建管理员'}</Button>
      </Form>
    </Card>
  </div>;
}
