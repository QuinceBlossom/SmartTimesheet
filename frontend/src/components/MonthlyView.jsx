import { useEffect, useState } from 'react';
import axios from '../axiosConfig';
import { Calendar, Badge, Popover, Tag } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';

dayjs.locale('vi');

export default function MonthlyView({ user, refreshTrigger }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!user) return;
    axios.get(`/work-logs/user/${user.id}`)
      .then(res => setLogs(res.data))
      .catch(err => console.error(err));
  }, [user, refreshTrigger]);

  const formatDuration = (num) => {
    if (!num) return '0 phút';
    const hours = Math.floor(num);
    const minutes = Math.round((num - hours) * 60);
    return hours > 0 ? `${hours} giờ ${minutes > 0 ? minutes + ' phút' : ''}` : `${minutes} phút`;
  };

  // --- HÀM MỚI: QUY ĐỊNH MÀU SẮC TRẠNG THÁI ---
  const getStatusConfig = (status) => {
    // Mặc định dữ liệu cũ chưa có status thì coi là Approved (xanh)
    const st = status || 'Pending';

    switch (st) {
      case 'Approved': return { color: 'success', text: 'Đã duyệt' }; // Xanh lá
      case 'Rejected': return { color: 'error', text: 'Từ chối' };   // Đỏ
      default: return { color: 'warning', text: 'Chờ duyệt' };       // Vàng cam
    }
  };

  const dateCellRender = (value) => {
    const currentCellDate = value.format('YYYY-MM-DD');
    const dailyTasks = logs.filter(log => dayjs(log.work_date).format('YYYY-MM-DD') === currentCellDate);

    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {dailyTasks.map(item => {
          // Lấy cấu hình màu dựa trên status của task đó
          const statusConfig = getStatusConfig(item.status);

          return (
            <li key={item.id}>
              <Popover
                trigger="click"
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b>{item.task_name}</b>
                    {/* Hiện trạng thái trong popup luôn */}
                    <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
                  </div>
                }
                content={
                  <div style={{ width: 300 }}>
                    <p>⏱ <b>Thời gian:</b> {formatDuration(item.hours)}</p>
                    <p>📝 <b>Mô tả:</b> {item.description || 'Không có mô tả'}</p>
                    {/* Nếu bị từ chối thì hiện dòng nhắc nhở */}
                    {item.status === 'Rejected' && <p style={{ color: 'red' }}>⚠️ Bị từ chối: Vui lòng kiểm tra lại!</p>}
                  </div>
                }
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <Badge
                    // LOGIC MÀU SẮC Ở ĐÂY
                    status={statusConfig.color}
                    text={
                      <span style={{ fontSize: '11px', cursor: 'pointer', userSelect: 'none', color: item.status === 'Rejected' ? 'red' : 'inherit' }}>
                        {/* Nếu bị từ chối thì gạch ngang tên cho dễ nhìn */}
                        {item.status === 'Rejected' ? <del>{item.task_name}</del> : <b>{item.task_name}</b>}
                        {' '}({item.hours}h)
                      </span>
                    }
                  />
                </div>
              </Popover>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div style={{ background: '#fff', padding: 20, borderRadius: 8 }}>
      <h3>Lịch sử làm việc tháng {dayjs().format('MM/YYYY')}</h3>
      {/* Chú thích màu sắc cho nhân viên hiểu */}
      <div style={{ marginBottom: 10, display: 'flex', gap: 15, fontSize: '12px' }}>
        <span><Badge status="warning" /> Chờ duyệt</span>
        <span><Badge status="success" /> Đã duyệt</span>
        <span><Badge status="error" /> Bị từ chối</span>
      </div>
      <Calendar cellRender={dateCellRender} />
    </div>
  );
}