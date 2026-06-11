import { useEffect, useState } from 'react';
import axios from '../axiosConfig';
import { Table, Select, InputNumber, Button, Input, message, Alert, TimePicker, Popconfirm, Modal, Upload, Progress, Row, Col, Card, Tag, Popover, Badge } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, LeftOutlined, RightOutlined, UploadOutlined, PaperClipOutlined, BellOutlined, InboxOutlined } from '@ant-design/icons';
import { io } from 'socket.io-client';

import dayjs from 'dayjs';
import 'dayjs/locale/vi';

dayjs.locale('vi');

export default function Timesheet({ user, onSaved }) {
  const [tasks, setTasks] = useState([]);
  const [data, setData] = useState([]);
  const [currentDate, setCurrentDate] = useState(dayjs()); // Quản lý tuần đang xem
  const [missingDays, setMissingDays] = useState([]);
  const [pendingScrollDate, setPendingScrollDate] = useState(null); // State để chờ scroll sau khi render
  const [reportedTaskIds, setReportedTaskIds] = useState([]); // Danh sách ID các task đã báo cáo

  const [requestEditModalOpen, setRequestEditModalOpen] = useState(false);
  const [requestEditLogId, setRequestEditLogId] = useState(null);
  const [requestEditReason, setRequestEditReason] = useState('');


  const [uploadPercent, setUploadPercent] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const [viewFeedbackModal, setViewFeedbackModal] = useState({ open: false, content: '', grade: '' });

  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [activeRowKeyForNewTask, setActiveRowKeyForNewTask] = useState(null);

  // --- LOGIC 0: TỰ ĐỘNG CẬP NHẬT REALTIME BẰNG SOCKET.IO ---
  useEffect(() => {
    const socket = io(process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
    socket.on('worklogs_updated', () => {
       fetchAndMergeData();
    });
    socket.on('tasks_updated', () => {
       fetchTasks();
    });
    return () => socket.disconnect();
  }, [user]);

  // --- LOGIC 1: LOAD DỮ LIỆU TỪ DATABASE VÀO BẢNG ---
  const fetchAndMergeData = async () => {
    // 1. Tạo khung xương cho 5 ngày (Thứ 2 -> Thứ 6)
    const startOfWeek = currentDate.startOf('week');
    let weekFrame = [];
    for (let i = 0; i < 5; i++) {
      weekFrame.push(startOfWeek.add(i, 'day'));
    }

    try {
      // 2. Gọi API lấy dữ liệu cũ của user
      const res = await axios.get(`/work-logs/user/${user.id}`);
      const dbLogs = res.data; // Dữ liệu từ DB

      const reported = dbLogs.map(log => log.task_id).filter(id => id != null);
      setReportedTaskIds(reported);

      let finalData = [];

      // 3. Ghép dữ liệu DB vào khung xương
      weekFrame.forEach(dayObj => {
        const dateStr = dayObj.format('YYYY-MM-DD');
        const dayName = dayObj.format('dddd');

        // Tìm xem ngày này trong DB có dữ liệu không?
        const logsForDay = dbLogs.filter(log => dayjs(log.work_date).format('YYYY-MM-DD') === dateStr);

        if (logsForDay.length > 0) {
          // Nếu CÓ: Map dữ liệu DB ra bảng
          logsForDay.forEach(log => {
            finalData.push({
              key: log.id, // Lưu ý: Key bây giờ là ID thật trong DB
              id: log.id,  // Lưu thêm ID để phân biệt Add/Edit
              date: dateStr,
              dayName: dayName,
              taskId: log.task_id,
              hours: log.hours,
              desc: log.description || '',
              attachmentUrl: log.attachment_url || null,
              attachmentName: log.attachment_name || null,
              status: log.status,
              feedback: log.feedback || null,
              actual_grade: log.actual_grade || null
            });
          });
        } else {
          // Nếu KHÔNG: Tạo dòng trống để nhập
          finalData.push({
            key: dateStr + '-empty', // Key giả
            id: null,                // Không có ID
            date: dateStr,
            dayName: dayName,
            taskId: null,
            hours: 8.8,
            desc: '',
            attachmentUrl: null,
            attachmentName: null,
            status: null,
            feedback: null,
            actual_grade: null
          });
        }
      });

      setData(finalData);
      checkMissingDays(dbLogs); // Tiện thể check cảnh báo luôn

    } catch (error) {
      console.error("Lỗi load dữ liệu:", error);
    }
  };

  const fetchTasks = () => {
      axios.get('/tasks').then(res => {
        // Chỉ lấy những task phù hợp với user (assigned_to contains user.id or is null)
        // nhưng hiện tại backend trả hết. Ta lưu toàn bộ object để lấy is_new và description.
        setTasks(res.data); 
      });
  };

  const handleTaskSelect = (rowKey, taskId) => {
      handleUpdate(rowKey, 'taskId', taskId);
      
      const selectedTask = tasks.find(t => t.id === taskId);
      if (selectedTask) {
          // Xóa badge NEW nếu có
          if (selectedTask.is_new) {
             axios.post(`/tasks/mark-seen/${taskId}`).catch(e => console.error(e));
             // Cập nhật state local ngay lập tức để mất badge
             setTasks(prev => prev.map(t => t.id === taskId ? {...t, is_new: 0} : t));
          }

          // Cập nhật Đề bài
          if (selectedTask.description) {
             const existingRow = data.find(item => item.key === rowKey);
             let currentDesc = existingRow?.desc || '';
             
             const splitStr = "--- Báo Cáo Staff ---";
             if (currentDesc.includes(splitStr)) {
                 currentDesc = currentDesc.split(splitStr)[1].trim(); 
             } else if (currentDesc.includes("[YÊU CẦU TỪ MANAGER]")) {
                 currentDesc = ""; 
             }
             
             let newDesc = currentDesc;
             if (selectedTask.description) {
                 newDesc = `[YÊU CẦU TỪ MANAGER]: ${selectedTask.description}\n\n${splitStr}\n${currentDesc}`;
             }
             handleUpdate(rowKey, 'desc', newDesc);
          }
      }
  };



  // Chạy hàm này mỗi khi đổi tuần hoặc đổi user
  useEffect(() => {
    if (user) fetchAndMergeData();
  }, [currentDate, user]);

  // Effect để xử lý scroll sau khi data đã load xong
  useEffect(() => {
    if (pendingScrollDate) {
      // Tìm element có id tương ứng
      const element = document.getElementById(`date-${pendingScrollDate}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight nhẹ để user thấy
        element.style.backgroundColor = '#fff1f0';
        setTimeout(() => {
          element.style.backgroundColor = 'transparent';
        }, 2000);
        setPendingScrollDate(null); // Reset state
      }
    }
  }, [data, pendingScrollDate]);

  // --- LOGIC 2: HỆ THỐNG KIỂM TRA CÔNG THIẾU ---
  const checkMissingDays = (workedLogs) => {
    const workedDates = workedLogs.map(item => dayjs(item.work_date).format('YYYY-MM-DD'));
    const missing = [];
    const today = dayjs();

    for (let i = 1; i <= 10; i++) {
      const pastDay = today.subtract(i, 'day');
      if (pastDay.day() === 0 || pastDay.day() === 6) continue;
      const dateStr = pastDay.format('YYYY-MM-DD');
      if (!workedDates.includes(dateStr)) {
        // Lưu object thay vì string để xử lý click
        missing.push({
          date: dateStr,
          label: pastDay.format('DD/MM (dddd)')
        });
      }
    }
    setMissingDays(missing);
  };

  // Hàm xử lý khi click vào ngày thiếu
  const handleJumpToDate = (dateStr) => {
    const targetDate = dayjs(dateStr);
    const startOfTargetWeek = targetDate.startOf('week');
    const startOfCurrentView = currentDate.startOf('week');

    // Nếu ngày đó KHÔNG nằm trong tuần đang xem -> Chuyển tuần
    if (!startOfTargetWeek.isSame(startOfCurrentView, 'day')) {
      setCurrentDate(targetDate);
    }

    // Đặt cờ để scroll sau khi render lại
    setPendingScrollDate(dateStr);
  };

  // --- LOGIC 3: CÁC HÀM XỬ LÝ ---
  useEffect(() => {
    fetchTasks();
  }, []);

  const handleAddRow = (currentRecord) => {
    const newData = [...data];
    const index = newData.findIndex(item => item.key === currentRecord.key);
    // Dòng mới thêm sẽ không có ID -> Để Backend biết là INSERT
    const newRow = {
      ...currentRecord,
      key: Date.now().toString(),
      id: null,
      taskId: null, hours: 8.8, desc: '', attachmentUrl: null, attachmentName: null
    };
    newData.splice(index + 1, 0, newRow);
    setData(newData);
  };

  const handleDeleteRow = (record) => {
    // Nếu dòng này đã có trong DB (có id) -> Gọi API Xóa thật
    if (record.id) {
      axios.delete(`/work-logs/${record.id}`)
        .then(() => {
          message.success("Đã xóa dữ liệu!");
          fetchAndMergeData(); // Load lại bảng
        })
        .catch(() => message.error("Lỗi khi xóa!"));
    } else {
      // Nếu dòng này mới nhập (chưa lưu) -> Chỉ xóa trên giao diện
      const count = data.filter(item => item.date === record.date).length;
      if (count > 1) {
        setData(data.filter(item => item.key !== record.key));
      } else {
        // Reset dòng cuối cùng về rỗng
        handleUpdate(record.key, 'taskId', null);
        handleUpdate(record.key, 'hours', 0);
        handleUpdate(record.key, 'desc', '');
      }
    }
  };

  const openRequestEditModal = (id) => {
    setRequestEditLogId(id);
    setRequestEditReason('');
    setRequestEditModalOpen(true);
  };

  const submitRequestEdit = () => {
    if (!requestEditReason.trim()) {
      return message.warning("Vui lòng nhập lý do!");
    }
    axios.post(`/work-logs/request-edit/${requestEditLogId}`, { reason: requestEditReason })
      .then(res => {
        if(res.data.status === 'success'){
           message.success(res.data.message);
           fetchAndMergeData();
           if(onSaved) onSaved();
           setRequestEditModalOpen(false);
        } else {
           message.error(res.data.message);
        }
      })
      .catch(() => message.error("Lỗi kết nối!"));
  };

  const isOverdue = (dateStr) => {
    const entryDate = dayjs(dateStr).startOf('day');
    const currentDate = dayjs().startOf('day');
    return currentDate.diff(entryDate, 'day') > 7;
  };

  const isRowLocked = (record) => {
    if (record.status === 'Draft') return false; // Nếu Manager cho sửa thì KHÔNG khoá
    return isOverdue(record.date) || record.status === 'Approved' || record.status === 'Edit_Requested' || record.status === 'Pending';
  };

  const handleUpdate = (key, field, value) => {
    setData(prevData => prevData.map(item => item.key === key ? { ...item, [field]: value } : item));
  };

  const handleSubmit = () => {
    // Chỉ lấy những dòng hợp lệ VÀ KHÔNG BỊ KHÓA (Cho phép Pending, Draft, New)
    const validItems = data.filter(item => item.taskId && item.hours > 0 && !isRowLocked(item));

    if (validItems.length === 0) {
      message.warning("Không có công việc nào mới hoặc đang cho phép sửa để gửi!");
      return;
    }

    // Validation tổng số giờ mỗi ngày trên màn hình (không vượt 16h)
    const hoursPerDay = {};
    for (let item of validItems) {
      if(!hoursPerDay[item.date]) hoursPerDay[item.date] = 0;
      hoursPerDay[item.date] += item.hours;
    }
    
    for (let date in hoursPerDay) {
      if (hoursPerDay[date] > 16) {
        message.warning(`Tổng số giờ ngày ${dayjs(date).format('DD/MM')} vượt quá 16 tiếng. KHÔNG THỂ BÁO CÁO!`);
        return;
      }
    }

    const payload = validItems.map(item => ({ ...item, userId: user.id }));
    const formData = new FormData();
    formData.append('logs', JSON.stringify(payload));
    let hasFiles = false;
    validItems.forEach(item => {
        if (item.file) {
            formData.append(`file_${item.key}`, item.file);
            hasFiles = true;
        }
    });

    if (hasFiles) {
        setShowUploadModal(true);
        setUploadPercent(0);
    }

    axios.post('/submit-logs', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            if(hasFiles) setUploadPercent(percentCompleted);
        }
    })
      .then(res => {
        if (hasFiles) setShowUploadModal(false);
        if (res.data.status === 'success') {
          message.success(res.data.message || "✅ Đã lưu thành công!");
          fetchAndMergeData();
          if (onSaved) onSaved();
        } else {
          message.error(res.data.message);
        }
      })
      .catch(err => {
        if (hasFiles) setShowUploadModal(false);
        console.error(err);
        message.error("❌ Lỗi kết nối Server!");
      });
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'A': return 'red';
      case 'B': return 'orange';
      case 'C': return 'blue';
      case 'D': return 'green';
      default: return 'gray';
    }
  };

  const submitAssignTask = () => {
    const v = assignForm.getFieldsValue();
    let finalDeadline = null;
    if (v.deadlineDate || v.deadlineTime) {
        const datePart = v.deadlineDate ? v.deadlineDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
        const timePart = v.deadlineTime ? v.deadlineTime.format('HH:mm:ss') : '23:59:59';
        finalDeadline = `${datePart} ${timePart}`;
    } else {
        message.warning("Task không có hạn chót! Vui lòng chọn Deadline (ngày hoặc giờ).");
    }

    const payload = {
        // ... rest of implementation
    };
  };

  const handleInjectTask = (task) => {
    // Luôn nhận việc vào ngày hiện tại
    const targetDateStr = dayjs().format('YYYY-MM-DD');

    const targetWeekStart = dayjs(targetDateStr).startOf('week');
    const currentWeekStart = currentDate.startOf('week');
    
    if (!targetWeekStart.isSame(currentWeekStart, 'day')) {
        setCurrentDate(dayjs(targetDateStr));
    }

    setData(prevData => {
        const newData = [...prevData];
        const emptyRowIndex = newData.findIndex(
            item => item.date === targetDateStr && !item.taskId
        );

        const newDesc = `[YÊU CẦU TỪ MANAGER]: ${task.description || ''}\n\n--- Báo Cáo Staff ---\n`;

        if (emptyRowIndex !== -1) {
            newData[emptyRowIndex].taskId = task.id;
            newData[emptyRowIndex].desc = newDesc;
        } else {
            const newRow = {
                key: Date.now().toString(),
                id: null,
                date: targetDateStr,
                dayName: dayjs(targetDateStr).format('dddd'),
                taskId: task.id,
                hours: 0,
                desc: newDesc,
                attachmentUrl: null,
                attachmentName: null,
                status: null
            };
            
            const lastIndexOfDay = newData.map(e => e.date).lastIndexOf(targetDateStr);
            if (lastIndexOfDay !== -1) {
                newData.splice(lastIndexOfDay + 1, 0, newRow);
            } else {
                newData.push(newRow);
            }
        }
        return newData;
    });

    setPendingScrollDate(targetDateStr);
  };

  const handleCreateCustomTask = async (taskName) => {
    if (!taskName || !taskName.trim()) {
      return message.warning("Vui lòng nhập tên công việc!");
    }
    try {
      const res = await axios.post('/tasks/staff-create', { 
        task_name: taskName, 
        user_id: user.id 
      });
      if (res.data.status === 'success') {
        message.success("Tạo công việc thành công!");
        const newCreatedTask = res.data.task;
        
        // Cập nhật danh sách task của component ngay lập tức
        setTasks(prev => {
          if (prev.some(t => t.id === newCreatedTask.id)) return prev;
          return [newCreatedTask, ...prev];
        });
        
        // Tự động gán task mới này cho dòng timesheet hiện tại
        if (activeRowKeyForNewTask !== null) {
          handleUpdate(activeRowKeyForNewTask, 'taskId', newCreatedTask.id);
        }
        
        // Reset state & đóng modal
        setIsCreateTaskModalOpen(false);
        setActiveRowKeyForNewTask(null);
      } else {
        message.error(res.data.message || "Tạo công việc thất bại!");
      }
    } catch (error) {
      console.error("Lỗi tạo công việc:", error);
      message.error("Lỗi kết nối khi tạo công việc!");
    }
  };

  // --- HÀM CONVERT GIỜ ---
  const floatToTime = (num) => {
    if (!num) return null;
    const hours = Math.floor(num);
    const minutes = Math.round((num - hours) * 60);
    return dayjs().hour(hours).minute(minutes);
  };

  const timeToFloat = (timeObj) => {
    if (!timeObj) return 0;
    return timeObj.hour() + timeObj.minute() / 60;
  };

  // Nhóm data theo ngày để render dạng card
  const groupedData = data.reduce((acc, curr) => {
      if(!acc[curr.date]) acc[curr.date] = { date: curr.date, dayName: curr.dayName, logs: [] };
      acc[curr.date].logs.push(curr);
      return acc;
  }, {});
  const sortedDates = Object.keys(groupedData).sort();

  const activeIncomingTasks = tasks.filter(t => {
      let assignedArr = [];
      if (Array.isArray(t.assigned_to)) assignedArr = t.assigned_to;
      else if (typeof t.assigned_to === 'string') try { assignedArr = JSON.parse(t.assigned_to); } catch(e) {}
      
      const isAssignedToUser = assignedArr.includes(user?.id);
      const isReported = reportedTaskIds.includes(t.id);
      
      return isAssignedToUser && !isReported;
  });

  return (
    <div style={{ background: '#f9fafb', padding: '24px 32px', borderRadius: 12, minHeight: '100vh', fontFamily: "'Inter', 'Be Vietnam Pro', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
           <Button icon={<LeftOutlined />} onClick={() => setCurrentDate(currentDate.subtract(1, 'week'))}>Tuần trước</Button>
           <Button icon={<RightOutlined />} onClick={() => setCurrentDate(currentDate.add(1, 'week'))}>Tuần sau</Button>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#111827' }}>Bảng Mô tả Công Việc</h2>
          <span style={{ color: '#6366f1', fontWeight: 500, fontSize: 14 }}>
            {currentDate.startOf('week').format('DD/MM')} - {currentDate.startOf('week').add(4, 'day').format('DD/MM/YYYY')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {missingDays.length > 0 && (
            <Popover 
               content={
                  <ul style={{ paddingLeft: 20, margin: 0, color: '#ef4444', fontSize: 14 }}>
                     {missingDays.map(day => (
                        <li key={day.date} style={{ marginBottom: 4 }}>
                           <a style={{ color: '#ef4444', textDecoration: 'underline' }} onClick={() => handleJumpToDate(day.date)}>
                              🔴 {day.label}
                           </a>
                        </li>
                     ))}
                  </ul>
               } 
               title={<span style={{ color: '#ef4444', fontWeight: 600 }}>Ngày chưa nhập giờ</span>} 
               trigger="click"
               placement="bottomRight"
            >
               <Badge count={missingDays.length} size="small" offset={[-4, 4]}>
                  <Button shape="circle" icon={<BellOutlined />} size="large" style={{ border: 'none', background: '#fee2e2', color: '#ef4444' }} />
               </Badge>
            </Popover>
          )}
          <Button type="primary" icon={<SaveOutlined />} size="large" onClick={handleSubmit} style={{ background: '#4f46e5', borderColor: '#4f46e5', borderRadius: 8, fontWeight: 500 }}>Gửi Báo Cáo</Button>
        </div>
      </div>
      
      {activeIncomingTasks.length > 0 && (
        <Card 
            title={
                <span style={{ color: '#0369a1', fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <InboxOutlined /> Việc Mới Được Giao
                </span>
            }
            style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #bae6fd', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}
            bodyStyle={{ padding: 0 }}
        >
            <Table
                dataSource={activeIncomingTasks}
                rowKey="id"
                pagination={false}
                style={{ '--ant-component-background': 'transparent' }}
                columns={[
                    {
                        title: 'Độ Ưu Tiên',
                        dataIndex: 'priority',
                        width: 120,
                        render: (p) => {
                            const val = p || 'C';
                            const borderColor = val === 'A' ? '#ef4444' : val === 'B' ? '#f97316' : val === 'C' ? '#3b82f6' : '#22c55e';
                            const bgColor = val === 'A' ? '#fef2f2' : val === 'B' ? '#fff7ed' : val === 'C' ? '#eff6ff' : '#f0fdf4';
                            const color = val === 'A' ? '#b91c1c' : val === 'B' ? '#c2410c' : val === 'C' ? '#1d4ed8' : '#15803d';
                            return <Tag style={{ margin: 0, fontWeight: 600, borderRadius: 12, border: `1px solid ${borderColor}`, background: bgColor, color: color }}>Ưu tiên {val}</Tag>;
                        }
                    },
                    {
                        title: 'Tên Tác Vụ',
                        dataIndex: 'task_name',
                        render: (text, record) => {
                            const baseURL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
                            return (
                                <div>
                                    <b style={{ color: '#0f172a', fontSize: 15 }}>{text}</b>
                                    {record.attachment_url && (
                                        <div style={{ marginTop: 6 }}>
                                            <a href={`${baseURL}${record.attachment_url}`} target="_blank" rel="noreferrer" style={{fontSize: 13, color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4}}>
                                                <PaperClipOutlined /> {record.attachment_name || 'Xem file đính kèm'}
                                            </a>
                                        </div>
                                    )}
                                </div>
                            );
                        }
                    },
                    {
                        title: 'Dự Án / Nhóm Việc',
                        dataIndex: 'task_group',
                        render: (text) => <span style={{ color: '#475569', fontWeight: 500 }}>{text || 'Dự án chung'}</span>
                    },
                    {
                        title: 'Hạn Chót (Deadline)',
                        dataIndex: 'deadline',
                        render: (d) => d ? (
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#f43f5e', background: '#fff1f2', padding: '4px 10px', borderRadius: 12 }}>
                                ⏳ {dayjs(d).format('HH:mm DD/MM/YYYY')}
                            </span>
                        ) : (
                            <span style={{ color: '#94a3b8' }}>Hôm nay</span>
                        )
                    },
                    {
                        title: 'Thao Tác',
                        width: 150,
                        align: 'center',
                        render: (_, record) => (
                            <Button 
                                type="primary" 
                                style={{ borderRadius: 8, background: '#0284c7', borderColor: '#0284c7', fontWeight: 500 }} 
                                onClick={() => handleInjectTask(record)}
                            >
                                Nhập việc ngay
                            </Button>
                        )
                    }
                ]}
            />
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
         {sortedDates.map(dateStr => {
            const dayData = groupedData[dateStr];
            return (
               <Card key={dateStr} id={`date-${dateStr}`} style={{ borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }} bodyStyle={{ padding: 24 }}>
                  <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ margin: 0, color: '#0f172a', fontSize: 18, fontWeight: 600 }}>{dayData.dayName} <span style={{ color: '#64748b', fontSize: 15, fontWeight: 500, marginLeft: 8 }}>{dayjs(dateStr).format('DD/MM/YYYY')}</span></h3>
                  </div>
                  
                  {/* Row headers for clarity */}
                  {dayData.logs.length > 0 && (
                      <Row gutter={16} style={{ marginBottom: 8, padding: '0 8px' }}>
                          <Col span={6}><div style={{ color: '#64748b', fontSize: 13, fontWeight: 600, textTransform: 'uppercase' }}>Công việc</div></Col>
                          <Col span={3}><div style={{ color: '#64748b', fontSize: 13, fontWeight: 600, textTransform: 'uppercase' }}>Thời gian</div></Col>
                          <Col span={7}><div style={{ color: '#64748b', fontSize: 13, fontWeight: 600, textTransform: 'uppercase' }}>Mô tả chi tiết</div></Col>
                          <Col span={4}><div style={{ color: '#64748b', fontSize: 13, fontWeight: 600, textTransform: 'uppercase' }}>Đính kèm</div></Col>
                          <Col span={4}><div style={{ color: '#64748b', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', textAlign: 'center' }}>Trạng thái & Thao tác</div></Col>
                      </Row>
                  )}

                  {dayData.logs.map((log, index) => {
                      const locked = isRowLocked(log);
                      const baseURL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
                      const currentTask = tasks.find(t => t.id === log.taskId);
                      return (
                        <Row key={log.key} gutter={16} style={{ marginBottom: index === dayData.logs.length - 1 ? 0 : 16, alignItems: 'flex-start', background: '#f8fafc', padding: '16px 8px', borderRadius: 12 }}>
                           <Col span={6}>
                               <Select 
                                  disabled={locked} 
                                  placeholder="Chọn việc..." 
                                  style={{ width: '100%' }} 
                                  value={log.taskId} 
                                  onChange={(val) => handleTaskSelect(log.key, val)}
                                  optionLabelProp="label"
                                  className="modern-select"
                                  dropdownRender={(menu) => (
                                     <>
                                        {menu}
                                        <div style={{ borderTop: '1px solid #f0f0f0', margin: '4px 0' }} />
                                        <div style={{ padding: '4px 8px' }}>
                                           <Button 
                                              type="dashed" 
                                              icon={<PlusOutlined />} 
                                              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                              onClick={() => {
                                                 setActiveRowKeyForNewTask(log.key);
                                                 setIsCreateTaskModalOpen(true);
                                              }}
                                           >
                                              Tự tạo công việc
                                           </Button>
                                        </div>
                                     </>
                                  )}
                               >
                                  {tasks.map(t => {
                                     let assignedArr = [];
                                     if (Array.isArray(t.assigned_to)) assignedArr = t.assigned_to;
                                     else if (typeof t.assigned_to === 'string') try { assignedArr = JSON.parse(t.assigned_to); } catch(e) {}
                                     
                                     const isAssignedToUser = assignedArr.includes(user.id);
                                     const isUnassigned = assignedArr.length === 0;
                                     const isForOtherUser = assignedArr.length > 0 && !isAssignedToUser;
                                     const isReported = reportedTaskIds.includes(t.id);
                                     
                                     if (isUnassigned && log.taskId !== t.id) return null;
                                     if (isForOtherUser && log.taskId !== t.id) return null; 
                                     if (isAssignedToUser && isReported && log.taskId !== t.id) return null; 
                                     
                                     const showNewBadge = Boolean(t.is_new) && isAssignedToUser;
                                     return (
                                        <Select.Option key={t.id} value={t.id} label={t.task_name}>
                                           <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                              <span>{t.task_name}</span>
                                              {showNewBadge && <Tag color="green" style={{marginRight: 0}}>NEW</Tag>}
                                           </div>
                                        </Select.Option>
                                     )
                                  })}
                               </Select>
                           </Col>
                           <Col span={3}>
                               <TimePicker
                                  disabled={locked}
                                  format="HH:mm"
                                  placeholder="00:00"
                                  showNow={false}
                                  minuteStep={5}
                                  value={floatToTime(log.hours)}
                                  onChange={(time) => handleUpdate(log.key, 'hours', timeToFloat(time))}
                                  style={{ width: '100%', borderRadius: 6 }}
                               />
                           </Col>
                           <Col span={7}>
                               <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} disabled={locked} value={log.desc} onChange={(e) => handleUpdate(log.key, 'desc', e.target.value)} style={{ borderRadius: 8, borderColor: '#e2e8f0' }} />
                           </Col>
                           <Col span={4}>
                               <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                  {currentTask?.attachment_url && (
                                     <div style={{ padding: '8px', background: '#f0fdf4', borderRadius: '6px', border: '1px dashed #10b981' }}>
                                        <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, display: 'block', marginBottom: 4 }}>FILE YÊU CẦU:</span>
                                        <a href={`${baseURL}${currentTask.attachment_url}`} target="_blank" rel="noreferrer" style={{fontSize: 13, color: '#059669', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: 4}}>
                                          <PaperClipOutlined /> {currentTask.attachment_name || 'Tải file'}
                                        </a>
                                     </div>
                                  )}
                                  
                                  <div style={{ padding: '8px', background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                     <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 6 }}>FILE BÁO CÁO:</span>
                                     {(log.attachmentUrl || log.file) && (
                                        log.attachmentUrl ? (
                                          <a href={`${baseURL}${log.attachmentUrl}`} target="_blank" rel="noreferrer" style={{fontSize: 13, color: '#3b82f6', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8}}>
                                            <PaperClipOutlined /> Biên bản
                                          </a>
                                        ) : (
                                          <span style={{fontSize: 13, color: '#64748b', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8}}><PaperClipOutlined /> File chờ lưu</span>
                                        )
                                     )}
                                     {!locked && (
                                       <Upload 
                                         beforeUpload={(file) => {
                                             setData(prev => prev.map(item => item.key === log.key ? { ...item, file: file, attachmentName: file.name, attachmentUrl: null } : item));
                                             return false;
                                         }}
                                         fileList={[]}
                                         accept=".ppt,.pptx,.xls,.xlsx,.csv,.json,.doc,.docx,.pdf,.png,.jpg,.jpeg"
                                       >
                                         <Button icon={<UploadOutlined />} size="small" style={{ borderRadius: 6, width: '100%' }}>Chọn File</Button>
                                       </Upload>
                                     )}
                                  </div>
                               </div>
                           </Col>
                           <Col span={4} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                               {/* Trạng thái */}
                               <div style={{display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center'}}>
                                  {log.status === 'Approved' && <Tag style={{ borderRadius: 12, border: 'none', background: '#f0fdf4', color: '#16a34a', fontWeight: 500, margin: 0 }}>Đã Duyệt</Tag>}
                                  {log.status === 'Pending' && <Tag style={{ borderRadius: 12, border: 'none', background: '#fffbeb', color: '#d97706', fontWeight: 500, margin: 0 }}>Chờ Duyệt</Tag>}
                                  {log.status === 'Rejected' && <Tag style={{ borderRadius: 12, border: 'none', background: '#fef2f2', color: '#dc2626', fontWeight: 500, margin: 0 }}>Từ Chối</Tag>}
                                  {log.status === 'Edit_Requested' && <Tag style={{ borderRadius: 12, border: 'none', background: '#faf5ff', color: '#9333ea', fontWeight: 500, margin: 0 }}>Xin Sửa</Tag>}
                                  {log.status === 'Draft' && <Tag style={{ borderRadius: 12, border: 'none', background: '#e0f2fe', color: '#0284c7', fontWeight: 500, margin: 0 }}>Đang sửa</Tag>}
                               </div>

                               {/* Thao tác & Feedback */}
                               <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                                 {(log.feedback || log.actual_grade) && (
                                     <Button size="small" type="link" onClick={() => setViewFeedbackModal({ open: true, content: log.feedback, grade: log.actual_grade })} style={{ padding: 0, fontSize: 13 }}>
                                         Xem Feedback
                                     </Button>
                                 )}
                                 {log.status === 'Approved' ? (
                                   <Button type="primary" danger size="small" onClick={() => openRequestEditModal(log.id)} style={{ borderRadius: 6, fontSize: 12 }}>Yêu cầu sửa</Button>
                                 ) : log.status === 'Edit_Requested' ? (
                                   <span style={{ color: '#3b82f6', fontSize: 12 }}>Đang chờ</span>
                                 ) : log.status === 'Pending' ? (
                                   <span style={{ color: '#d97706', fontSize: 12 }}>Xử lý...</span>
                                 ) : isOverdue(log.date) && log.status !== 'Draft' && log.status !== 'Approved' && log.status !== 'Edit_Requested' ? (
                                   <span style={{ color: '#94a3b8', fontSize: 12 }}>Khóa sổ</span>
                                 ) : (
                                   <>
                                     <Button type="dashed" icon={<PlusOutlined />} size="small" onClick={() => handleAddRow(log)} style={{ borderRadius: 6, color: '#3b82f6', borderColor: '#bfdbfe', background: '#eff6ff' }} />
                                     <Popconfirm title="Bạn có chắc muốn xóa?" onConfirm={() => handleDeleteRow(log)}>
                                       <Button danger icon={<DeleteOutlined />} size="small" style={{ borderRadius: 6, background: '#fef2f2', border: 'none' }} />
                                     </Popconfirm>
                                   </>
                                 )}
                               </div>
                           </Col>
                        </Row>
                      );
                  })}
               </Card>
            );
         })}
      </div>

      <Modal title="Trạng thái Tải Lên" open={showUploadModal} footer={null} closable={false}>
         <div style={{textAlign: 'center', padding: '20px 0'}}>
             <Progress type="circle" percent={uploadPercent} status={uploadPercent === 100 ? "success" : "active"} />
             <p style={{marginTop: 15}}>{uploadPercent === 100 ? "Đang xử lý..." : "Đang tải file lên máy chủ hệ thống (Max 10MB)..."}</p>
         </div>
      </Modal>

      <Modal title="Nhập lý do yêu cầu sửa" open={requestEditModalOpen} onOk={submitRequestEdit} onCancel={() => setRequestEditModalOpen(false)} okText="Gửi yêu cầu" cancelText="Hủy">
        <Input.TextArea rows={4} placeholder="Nhập lý do bạn muốn sửa bản ghi này..." value={requestEditReason} onChange={e => setRequestEditReason(e.target.value)} />
      </Modal>

      <CreateTaskModal
         open={isCreateTaskModalOpen}
         onOk={handleCreateCustomTask}
         onCancel={() => {
            setIsCreateTaskModalOpen(false);
            setActiveRowKeyForNewTask(null);
         }}
      />

      <Modal title="Feedback từ Quản lý" open={viewFeedbackModal.open} footer={null} onCancel={() => setViewFeedbackModal({open: false, content: '', grade: ''})}>
          {viewFeedbackModal.grade && <h4 style={{color: '#1890ff'}}>Xếp hạng được cấp: Hạng {viewFeedbackModal.grade}</h4>}
          {viewFeedbackModal.content ? (
             <div style={{marginTop: 15, padding: 10, background: '#f5f5f5', borderRadius: 5}}>
                 {viewFeedbackModal.content}
             </div>
          ) : (
             <div style={{marginTop: 15, fontStyle: 'italic', color: '#999'}}>Quản lý không để lại nhận xét.</div>
          )}
      </Modal>
    </div>
  );
}

// --- SUB-COMPONENT ĐỂ TRÁNH RE-RENDER CẢ TIMESHEET KHI GÕ PHÍM ---
function CreateTaskModal({ open, onOk, onCancel }) {
  const [newTaskName, setNewTaskName] = useState('');

  const handleOk = () => {
    onOk(newTaskName);
    setNewTaskName('');
  };

  const handleCancel = () => {
    onCancel();
    setNewTaskName('');
  };

  return (
    <Modal 
       title="Tự tạo công việc mới" 
       open={open} 
       onOk={handleOk} 
       onCancel={handleCancel} 
       okText="Tạo" 
       cancelText="Hủy"
       destroyOnClose
    >
       <div style={{ margin: '16px 0' }}>
          <p style={{ marginBottom: 8, fontWeight: 500 }}>Tên công việc:</p>
          <Input 
             placeholder="Nhập tên công việc mới..." 
             value={newTaskName} 
             onChange={(e) => setNewTaskName(e.target.value)} 
             onPressEnter={handleOk}
          />
       </div>
    </Modal>
  );
}