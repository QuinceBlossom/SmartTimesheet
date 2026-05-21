import { useState } from 'react';
import { Button, Form, Input, Card, Typography, message, Modal } from 'antd';
import axios from '../axiosConfig';

const { Title } = Typography;

// Nhận vào hàm onLoginSuccess từ cha (App.jsx) để báo tin vui khi đăng nhập được
export default function Login({ onLoginSuccess }) {
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1 = Check Username, 2 = Reset Password
  const [resetUsername, setResetUsername] = useState("");
  const [resetForm] = Form.useForm();

  const handleLogin = (values) => {
    // Gọi API đăng nhập
    axios.post('/login', values)
      .then(res => {
        if (res.data.status === 'success') {
          message.success("Đăng nhập thành công!");
          // Gửi thông tin user ngược lên cho App.jsx biết
          onLoginSuccess(res.data.user);
        } else {
          message.error(res.data.message);
        }
      })
      .catch(err => message.error("Lỗi kết nối Server!"));
  };

  const openForgotModal = () => {
    setForgotStep(1);
    setResetUsername("");
    resetForm.resetFields();
    setIsForgotModalOpen(true);
  };

  const closeForgotModal = () => {
    setIsForgotModalOpen(false);
  };

  const handleCheckUsername = (values) => {
    axios.post('/users/check-username', { username: values.username })
      .then(res => {
        if (res.data.status === 'success') {
          setResetUsername(values.username);
          setForgotStep(2);
        } else {
          message.error(res.data.message || 'Không tìm thấy tài khoản này');
        }
      })
      .catch(err => message.error("Lỗi kết nối Server!"));
  };

  const handleResetPassword = (values) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error("Mật khẩu xác nhận không khớp!");
      return;
    }

    axios.post('/users/reset-password', { username: resetUsername, newPassword: values.newPassword })
      .then(res => {
        if (res.data.status === 'success') {
          message.success("Đổi mật khẩu thành công! Vui lòng đăng nhập lại.");
          closeForgotModal();
        } else {
          message.error(res.data.message || 'Lỗi khi đổi mật khẩu');
        }
      })
      .catch(err => message.error("Lỗi kết nối Server!"));
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 400, padding: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Title level={3}>Timesheet System</Title>
          <p>Đăng nhập để chấm công</p>
        </div>

        <Form layout="vertical" onFinish={handleLogin}>
          <Form.Item label="Tên đăng nhập" name="username" rules={[{ required: true, message: 'Nhập username đi bạn!' }]}>
            <Input placeholder="Ví dụ: khuongduy.ph" />
          </Form.Item>

          <Form.Item label="Mật khẩu" name="password" rules={[{ required: true, message: 'Nhập pass đi!' }]}>
            <Input.Password placeholder="Nhập mật khẩu..." />
          </Form.Item>

          <div style={{ textAlign: 'right', marginBottom: '20px', marginTop: '-10px' }}>
            <a onClick={openForgotModal} style={{ fontSize: '14px' }}>Quên mật khẩu?</a>
          </div>

          <Button type="primary" htmlType="submit" block size="large">
            Đăng nhập
          </Button>
        </Form>
      </Card>

      <Modal
        title={forgotStep === 1 ? "Tìm tài khoản" : "Đổi mật khẩu mới"}
        open={isForgotModalOpen}
        onCancel={closeForgotModal}
        footer={null}
      >
        {forgotStep === 1 && (
          <Form layout="vertical" onFinish={handleCheckUsername}>
            <Form.Item
              label="Tên đăng nhập"
              name="username"
              rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập...' }]}
            >
              <Input placeholder="Vui lòng nhập tên đăng nhập..." />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>Kiểm tra</Button>
          </Form>
        )}

        {forgotStep === 2 && (
          <Form layout="vertical" form={resetForm} onFinish={handleResetPassword}>
            <div style={{ marginBottom: 16 }}>
              <span>Đang đổi mật khẩu cho tài khoản: <b>{resetUsername}</b></span>
            </div>
            <Form.Item
              label="Mật khẩu mới"
              name="newPassword"
              rules={[{ required: true, message: 'Nhập mật khẩu mới!' }]}
            >
              <Input.Password placeholder="Mật khẩu mới..." />
            </Form.Item>
            <Form.Item
              label="Xác nhận mật khẩu"
              name="confirmPassword"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: 'Nhập lại mật khẩu mới!' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
                  },
                }),
              ]}
            >
              <Input.Password placeholder="Nhập lại mật khẩu mới..." />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>Đổi mật khẩu</Button>
          </Form>
        )}
      </Modal>
    </div>
  );
}