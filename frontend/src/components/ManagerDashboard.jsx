import { useEffect, useState, useRef } from 'react';
import axios from '../axiosConfig';
import { Table, Tag, Button, Modal, Card, Typography, message, Input, Select, DatePicker, TimePicker, InputNumber, Tabs, Form, Row, Col, AutoComplete, List, Radio, Dropdown, Tooltip, Drawer, Segmented, Upload } from 'antd';
import { EyeOutlined, UserOutlined, PlusCircleOutlined, PaperClipOutlined, ExportOutlined, SettingOutlined, TrophyOutlined, SaveOutlined, SearchOutlined, ClockCircleOutlined, HourglassOutlined, BellOutlined, CheckCircleOutlined, FileExcelOutlined, FilePdfOutlined, InfoCircleOutlined, DownOutlined, CloseOutlined, EditOutlined, CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { io } from 'socket.io-client';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title as ChartTitle, Tooltip as ChartTooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTitle, ChartTooltip, Legend);
const { Title } = Typography;

// FeedbackViewer component for manager feedback truncation
const FeedbackViewer = ({ feedback }) => {
    const [expanded, setExpanded] = useState(false);
    if (!feedback) return null;

    const limit = 100;
    const isLong = feedback.length > limit;
    const textToShow = expanded ? feedback : (isLong ? `${feedback.substring(0, limit)}...` : feedback);

    return (
        <div style={{ marginTop: 4, color: '#64748b' }}>
            <i>"{textToShow}"</i>
            {isLong && (
                <Button
                    type="link"
                    size="small"
                    style={{ padding: '0 4px', fontSize: 11, height: 'auto', display: 'inline-block' }}
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? 'Thu gọn' : 'Xem thêm'}
                </Button>
            )}
        </div>
    );
};

export default function ManagerDashboard({ user }) {
    const [stats, setStats] = useState([]);
    const [pendingLogs, setPendingLogs] = useState([]);
    const [leaderboard, setLeaderboard] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [draftTasks, setDraftTasks] = useState([]);
    const [currentDraftId, setCurrentDraftId] = useState(null);
    const [projectSuggestions, setProjectSuggestions] = useState([
        { value: 'Bảo trì hệ thống' }, { value: 'Phát triển tính năng' }, { value: 'Bug Fix' }, { value: 'R&D' }, { value: 'Đào tạo' }
    ]);
    const [taskSuggestions, setTaskSuggestions] = useState([
        { value: 'Review Code' }, { value: 'Viết Unit Test' }, { value: 'Viết tài liệu' }, { value: 'Fix Bug' }, { value: 'Họp Sprint' }
    ]);

    // Filters State
    const [searchText, setSearchText] = useState('');
    const [filterDept, setFilterDept] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [dateRange, setDateRange] = useState(null);

    // State Modal Cũ
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employeeLogs, setEmployeeLogs] = useState([]);
    const [newLog, setNewLog] = useState({ date: null, taskId: null, hours: 0, desc: '' });

    // Review Modal
    const [reviewModalOpen, setReviewModalOpen] = useState(false);
    const [reviewLog, setReviewLog] = useState(null);
    const [reviewForm] = Form.useForm();

    // Assign Task Form
    const [assignForm] = Form.useForm();
    const assignSelectRef = useRef(null);

    // KPI Settings Form
    const [kpiForm] = Form.useForm();

    // Pending Tasks Drawer
    const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectTargetId, setRejectTargetId] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [bulkGrade, setBulkGrade] = useState('C');
    const [rowGrades, setRowGrades] = useState({});
    const [mainRowGrades, setMainRowGrades] = useState({});

    // File Upload State
    const [uploadedFile, setUploadedFile] = useState(null);

    // Overdue Tasks State
    const [overdueDrawerOpen, setOverdueDrawerOpen] = useState(false);

    const getOverdueTasks = (tasksList) => {
        if (!tasksList) return [];
        // Sử dụng cờ isOverdue từ Backend trả về
        return tasksList.filter(task => task.isOverdue)
            .flatMap(task => {
                let assignedList = [];
                if (Array.isArray(task.assigned_to)) {
                    assignedList = task.assigned_to;
                } else if (typeof task.assigned_to === 'string') {
                    try {
                        assignedList = JSON.parse(task.assigned_to);
                    } catch (e) { }
                }
                if (!Array.isArray(assignedList)) {
                    assignedList = [];
                }
                return assignedList.map(staffId => {
                    const staff = stats.find(s => String(s.id) === String(staffId));
                    return {
                        ...task,
                        staffName: staff ? staff.full_name : 'Unknown',
                        // Sử dụng overdueHours từ Backend hoặc fallback
                        overdueHours: task.overdueHours || dayjs().diff(dayjs(task.deadline), 'hour')
                    }
                });
            });
    };

    const overdueTasks = getOverdueTasks(tasks);

    const selectedEmployeeRef = useRef(null);
    const dateRangeRef = useRef(null);

    useEffect(() => {
        selectedEmployeeRef.current = selectedEmployee;
    }, [selectedEmployee]);

    useEffect(() => {
        dateRangeRef.current = dateRange;
    }, [dateRange]);

    useEffect(() => {
        const socket = io(process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
        socket.on('worklogs_updated', () => {
            fetchStats();
            fetchPendingLogs();
            fetchLeaderboard();
            if (selectedEmployeeRef.current) {
                loadEmployeeLogs(selectedEmployeeRef.current.id);
            }
        });
        socket.on('tasks_draft_updated', fetchDraftTasks);
        return () => socket.disconnect();
    }, [user]);

    useEffect(() => {
        fetchStats();
        fetchPendingLogs();
    }, [user, dateRange]);

    useEffect(() => {
        fetchLeaderboard();
        fetchTasks();
        fetchKpiSettings();
        fetchDraftTasks();
    }, [user]);

    const fetchStats = (range = dateRangeRef.current) => {
        let url = user?.role === 'manager' ? `/manager/stats?managerId=${user.id}` : '/manager/stats';
        if (range && range[0] && range[1]) {
            const startStr = range[0].format('YYYY-MM-DD');
            const endStr = range[1].format('YYYY-MM-DD');
            url += (url.includes('?') ? '&' : '?') + `startDate=${startStr}&endDate=${endStr}`;
        } else {
            const startStr = dayjs().startOf('month').format('YYYY-MM-DD');
            const endStr = dayjs().endOf('month').format('YYYY-MM-DD');
            url += (url.includes('?') ? '&' : '?') + `startDate=${startStr}&endDate=${endStr}`;
        }
        axios.get(url).then(res => setStats(res.data)).catch(err => console.error(err));
    };

    const fetchPendingLogs = () => {
        const url = user?.role === 'manager' ? `/manager/pending-worklogs?managerId=${user.id}` : '/manager/pending-worklogs';
        axios.get(url).then(res => setPendingLogs(res.data)).catch(err => console.error(err));
    };

    const [leaderboardMonth, setLeaderboardMonth] = useState(dayjs());

    const fetchLeaderboard = (monthDate = leaderboardMonth) => {
        const monthStr = monthDate.format('MM/YYYY');
        const url = user?.role === 'manager' ? `/manager/kpi-leaderboard?managerId=${user.id}&month=${monthStr}` : `/manager/kpi-leaderboard?month=${monthStr}`;
        axios.get(url).then(res => setLeaderboard(res.data)).catch(err => console.error(err));
    };

    const fetchTasks = () => {
        axios.get('/tasks').then(res => setTasks(res.data));
    };

    const fetchDraftTasks = () => {
        axios.get('/tasks/drafts').then(res => setDraftTasks(res.data));
    };

    const fetchKpiSettings = () => {
        const month = dayjs().format('MM/YYYY');
        axios.get(`/kpi-settings?managerId=${user.id}&month=${month}`).then(res => {
            kpiForm.setFieldsValue({
                eval_month: res.data.eval_month ? dayjs(res.data.eval_month, 'MM/YYYY') : dayjs(),
                target_points: res.data.target_points || 50,
                excellent_points: res.data.excellent_points || 70
            });
        });
    };

    const saveKpiSettings = () => {
        const vals = kpiForm.getFieldsValue();
        const eval_month = vals.eval_month ? vals.eval_month.format('MM/YYYY') : dayjs().format('MM/YYYY');
        axios.post('/kpi-settings', { eval_month, target_points: vals.target_points, excellent_points: vals.excellent_points, managerId: user.id }).then(() => {
            message.success("Lưu cấu hình KPI thành công!");
        });
    };

    const submitAssignTask = () => {
        const v = assignForm.getFieldsValue();
        let finalDeadline = null;
        if (v.deadlineDate || v.deadlineTime) {
            const datePart = v.deadlineDate ? v.deadlineDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
            const timePart = v.deadlineTime ? v.deadlineTime.format('HH:mm:ss') : '23:59:59';
            finalDeadline = `${datePart} ${timePart}`;
        }

        const payload = {
            ...v,
            deadline: finalDeadline,
            attachment_url: uploadedFile?.url || null,
            attachment_name: uploadedFile?.name || null,
            draftId: currentDraftId
        };
        axios.post('/tasks/bulk', payload).then(() => {
            message.success("Giao việc thành công!");
            assignForm.resetFields();
            setUploadedFile(null);
            setCurrentDraftId(null);
            fetchTasks();
        }).catch(err => message.error(err.response?.data?.message || "Lỗi giao việc"));
    };

    const handleSaveDraft = () => {
        assignForm.validateFields(['task_group', 'task_name']).then(v => {
            const fullValues = assignForm.getFieldsValue();
            let finalDeadline = null;
            if (fullValues.deadlineDate || fullValues.deadlineTime) {
                const datePart = fullValues.deadlineDate ? fullValues.deadlineDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
                const timePart = fullValues.deadlineTime ? fullValues.deadlineTime.format('HH:mm:ss') : '23:59:59';
                finalDeadline = `${datePart} ${timePart}`;
            }

            const payload = {
                ...fullValues,
                deadline: finalDeadline,
                attachment_url: uploadedFile?.url || null,
                attachment_name: uploadedFile?.name || null,
            };
            axios.post('/tasks/draft', payload).then(() => {
                message.success("Lưu vào danh sách chờ thành công!");
                assignForm.resetFields();
                setUploadedFile(null);
                setCurrentDraftId(null);
            }).catch(() => message.error("Lỗi lưu nháp"));
        }).catch(() => message.warning("Vui lòng điền Dự án và Tên Tác Vụ!"));
    };

    const selectDraft = (draft) => {
        setCurrentDraftId(draft.id);
        assignForm.setFieldsValue({
            task_group: draft.task_group,
            task_name: draft.task_name,
            description: draft.description,
            priority: draft.priority,
            expected_grade: draft.expected_grade,
            deadlineDate: draft.deadline ? dayjs(draft.deadline) : null,
            deadlineTime: draft.deadline ? dayjs(draft.deadline) : null,
            assigned_to: []
        });
        setUploadedFile(draft.attachment_url ? { url: draft.attachment_url, name: draft.attachment_name } : null);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        doc.text("Bang Xep Hang KPI", 20, 10);
        doc.autoTable({
            head: [['Ten', 'Phong Ban', 'Diem', 'Task A', 'Task B', 'Task C', 'Task D']],
            body: leaderboard.map(i => [i.full_name, i.department, i.accumulated_points, i.count_a, i.count_b, i.count_c, i.count_d]),
        });
        doc.save('Leaderboard.pdf');
    };

    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(leaderboard.map(i => ({
            'Tên': i.full_name, 'Phòng ban': i.department, 'Điểm Tích Lũy': i.accumulated_points,
            'Task A': i.count_a, 'Task B': i.count_b, 'Task C': i.count_c, 'Task D': i.count_d
        })));
        XLSX.utils.book_append_sheet(wb, ws, "Leaderboard");
        XLSX.writeFile(wb, "Leaderboard.xlsx");
    }

    const handleViewDetail = (employee) => {
        setSelectedEmployee(employee);
        setNewLog({ date: null, taskId: null, hours: 0, desc: '' });
        loadEmployeeLogs(employee.id);
        setIsModalOpen(true);
    };

    const loadEmployeeLogs = (empId) => {
        axios.get(`/work-logs/user/${empId}`).then(res => setEmployeeLogs(res.data));
    };

    const openReviewModal = (record) => {
        setReviewLog(record);
        reviewForm.setFieldsValue({
            status: record.status === 'Pending' || record.status === 'Edit_Requested' ? 'Approved' : record.status,
            actual_grade: record.actual_grade || 'C',
            feedback: record.feedback || ''
        });
        setReviewModalOpen(true);
    };

    const confirmReview = () => {
        const vals = reviewForm.getFieldsValue();
        axios.put('/work-logs/update-status', {
            id: reviewLog.id,
            status: vals.status,
            actual_grade: vals.actual_grade,
            feedback: vals.feedback
        }).then(() => {
            message.success("Đã lưu đánh giá!");
            setReviewModalOpen(false);
            loadEmployeeLogs(selectedEmployee.id);
            fetchStats(); // Update hours
            fetchLeaderboard(); // Update points
        }).catch(() => message.error("Lỗi cập nhật"));
    };

    const handleQuickApprove = (record) => {
        axios.put('/work-logs/update-status', { id: record.id, status: 'Approved' })
            .then(() => {
                message.success("Đã duyệt nhanh!");
                loadEmployeeLogs(selectedEmployeeRef.current?.id || selectedEmployee?.id);
            }).catch(() => message.error("Lỗi duyệt nhanh"));
    };

    const approveEditRequest = (record) => {
        axios.put('/work-logs/update-status', {
            id: record.id,
            status: 'Draft'
        }).then(() => {
            message.success("Đã cho phép chỉnh sửa!");
            loadEmployeeLogs(selectedEmployee.id);
        }).catch(() => message.error("Lỗi cập nhật"));
    };

    const handleManagerAddLog = () => {
        if (!newLog.date || !newLog.taskId || newLog.hours <= 0) return message.warning("Điền đủ thông tin!");
        const payload = {
            userId: selectedEmployee.id, taskId: newLog.taskId,
            date: newLog.date.format('YYYY-MM-DD'), hours: newLog.hours, description: newLog.desc
        };
        axios.post('/manager/create-log', payload).then(() => {
            message.success("Đã bổ sung công việc!");
            loadEmployeeLogs(selectedEmployee.id);
            fetchStats();
            setNewLog({ date: null, taskId: null, hours: 0, desc: '' });
        });
    };

    const mainColumns = [
        {
            title: 'Nhân viên',
            dataIndex: 'full_name',
            render: (t) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e0f2fe', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14 }}>
                        {t?.charAt(0) || 'U'}
                    </div>
                    <b style={{ color: '#0f172a', fontWeight: 600 }}>{t}</b>
                </div>
            )
        },
        { title: 'Phòng ban', dataIndex: 'department', render: (t) => <span style={{ color: '#475569', fontWeight: 500 }}>{t || 'Chưa cập nhật'}</span> },
        { title: 'Tổng giờ', dataIndex: 'total_hours', render: (val) => <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{parseFloat(val || 0).toFixed(1)}<span style={{ fontSize: 13, color: '#64748b', marginLeft: 2, fontWeight: 500 }}>h</span></span> },
        {
            title: 'Trạng thái',
            render: (_, r) => {
                const leadRow = leaderboard.find(item => String(item.id) === String(r.id));
                if (leadRow) {
                    const pts = parseFloat(leadRow.accumulated_points || 0);
                    const target = parseFloat(leadRow.target_points || 50);
                    const excellent = parseFloat(leadRow.excellent_points || 70);
                    if (pts >= excellent) {
                        return <Tag style={{ borderRadius: 12, border: 'none', background: '#faf5ff', color: '#9333ea', fontWeight: 600, padding: '4px 12px' }}>Xuất sắc</Tag>;
                    } else if (pts >= target) {
                        return <Tag style={{ borderRadius: 12, border: 'none', background: '#dcfce7', color: '#16a34a', fontWeight: 600, padding: '4px 12px' }}>Đạt KPI</Tag>;
                    } else if (pts > 0) {
                        return <Tag style={{ borderRadius: 12, border: 'none', background: '#fef9c3', color: '#ca8a04', fontWeight: 600, padding: '4px 12px' }}>Cần chú ý</Tag>;
                    } else {
                        return <Tag style={{ borderRadius: 12, border: 'none', background: '#fee2e2', color: '#dc2626', fontWeight: 600, padding: '4px 12px' }}>Thiếu giờ</Tag>;
                    }
                }
                const hrs = parseFloat(r.total_hours || 0);
                if (hrs >= 100) return <Tag style={{ borderRadius: 12, border: 'none', background: '#dcfce7', color: '#16a34a', fontWeight: 600, padding: '4px 12px' }}>Đạt KPI</Tag>;
                if (hrs > 0) return <Tag style={{ borderRadius: 12, border: 'none', background: '#fef9c3', color: '#ca8a04', fontWeight: 600, padding: '4px 12px' }}>Cần chú ý</Tag>;
                return <Tag style={{ borderRadius: 12, border: 'none', background: '#fee2e2', color: '#dc2626', fontWeight: 600, padding: '4px 12px' }}>Thiếu giờ</Tag>;
            }
        },
        {
            title: 'Hành động',
            render: (_, r) => {
                const empPending = pendingLogs.filter(log => String(log.user_id) === String(r.id));
                return (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <Button type="text" style={{ color: '#0ea5e9', background: '#f0f9ff', borderRadius: 8, padding: '4px 12px', display: 'flex', alignItems: 'center' }} icon={<EyeOutlined />} onClick={() => handleViewDetail(r)} />
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <Select
                                value={mainRowGrades[r.id] || 'C'}
                                onChange={(val) => setMainRowGrades(prev => ({ ...prev, [r.id]: val }))}
                                style={{ width: 60 }}
                                className="quick-approve-select"
                                options={[
                                    { value: 'A', label: 'A' },
                                    { value: 'B', label: 'B' },
                                    { value: 'C', label: 'C' },
                                    { value: 'D', label: 'D' }
                                ]}
                            />
                            <Tooltip title={empPending.length > 0 ? `Duyệt & Đánh giá nhanh ${empPending.length} task hạng ${mainRowGrades[r.id] || 'C'}` : `Duyệt & Đánh giá nhanh hạng ${mainRowGrades[r.id] || 'C'}`}>
                                <Button
                                    type="text"
                                    className="quick-approve-btn quick-approve-btn-approve"
                                    icon={<CheckOutlined style={{ fontSize: 18 }} />}
                                    onClick={() => handleApproveEmployeeAllPending(r.id, mainRowGrades[r.id] || 'C')}
                                />
                            </Tooltip>
                        </div>
                    </div>
                );
            }
        }
    ];

    const detailColumns = [
        { title: 'Ngày làm', dataIndex: 'work_date', width: 90, render: (val) => dayjs(val).format('DD/MM') },
        { title: 'Công việc', dataIndex: 'task_name', render: (t) => <b style={{ fontWeight: 500, color: '#0f172a' }}>{t}</b> },
        { title: 'Giờ', dataIndex: 'hours', width: 60, render: (val) => <Tag style={{ borderRadius: 12, border: 'none', background: '#f0f9ff', color: '#0ea5e9', fontWeight: 500 }}>{val}h</Tag> },
        {
            title: 'Đính kèm', render: (_, record) => {
                const baseURL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
                return record.attachment_url ? <a href={`${baseURL}${record.attachment_url}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#0ea5e9' }}><PaperClipOutlined /> Biên bản</a> : <span style={{ color: '#cbd5e1', fontSize: 13 }}>Trống</span>;
            }
        },
        {
            title: 'Hạng & Phản hồi', render: (_, record) => (
                <div style={{ fontSize: 13 }}>
                    {record.actual_grade ? <Tag style={{ borderRadius: 12, border: 'none', background: record.actual_grade === 'A' ? '#f0fdf4' : record.actual_grade === 'B' ? '#f0f9ff' : '#fefce8', color: record.actual_grade === 'A' ? '#16a34a' : record.actual_grade === 'B' ? '#0ea5e9' : '#ca8a04', fontWeight: 500 }}>Hạng: {record.actual_grade}</Tag> : <span style={{ color: '#64748b' }}>Chưa xếp hạng</span>}
                    <FeedbackViewer feedback={record.feedback} />
                </div>
            )
        },
        {
            title: 'Trạng thái', dataIndex: 'status', render: (st, r) => {
                if (st === 'Approved') return <Tag style={{ borderRadius: 12, border: 'none', background: '#f0fdf4', color: '#16a34a', fontWeight: 500, padding: '2px 10px' }}>Đã duyệt</Tag>;
                if (st === 'Rejected') return <Tag style={{ borderRadius: 12, border: 'none', background: '#fef2f2', color: '#dc2626', fontWeight: 500, padding: '2px 10px' }}>Từ chối</Tag>;
                if (st === 'Edit_Requested') return <div><Tag style={{ borderRadius: 12, border: 'none', background: '#faf5ff', color: '#9333ea', fontWeight: 500, padding: '2px 10px' }}>Yêu cầu sửa</Tag><br /><span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'inline-block' }}>{r.edit_reason}</span></div>;
                return <Tag style={{ borderRadius: 12, border: 'none', background: '#fefce8', color: '#ca8a04', fontWeight: 500, padding: '2px 10px' }}>Chờ duyệt</Tag>;
            }
        },
        {
            title: 'Thao tác', render: (_, record) => (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Button size="small" type="text" style={{ background: '#f0f9ff', color: '#0ea5e9', borderRadius: 6, fontWeight: 500 }} onClick={() => openReviewModal(record)}>Đánh giá</Button>
                    {record.status === 'Pending' && (
                        <Button size="small" type="text" style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: 6, fontWeight: 500 }} onClick={() => handleQuickApprove(record)}>Duyệt</Button>
                    )}
                    {record.status === 'Edit_Requested' && (
                        <Button size="small" type="text" style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 6, fontWeight: 500 }} onClick={() => approveEditRequest(record)}>Cho sửa</Button>
                    )}
                </div>
            )
        }
    ];

    const filteredStats = stats.filter(s => {
        const matchSearch = !searchText || s.full_name?.toLowerCase().includes(searchText.toLowerCase());
        const matchDept = filterDept === 'all' || s.department === filterDept;
        return matchSearch && matchDept;
    });

    const filteredPendingLogs = pendingLogs.filter(log => {
        const matchSearch = !searchText || log.full_name?.toLowerCase().includes(searchText.toLowerCase());
        const matchDept = filterDept === 'all' || (log.department === filterDept);
        let matchDate = true;
        if (dateRange && dateRange.length === 2) {
            const logDate = dayjs(log.work_date);
            matchDate = logDate.isAfter(dateRange[0].subtract(1, 'day'), 'day') && logDate.isBefore(dateRange[1].add(1, 'day'), 'day');
        }
        return matchSearch && matchDept && matchDate;
    });

    const departments = [...new Set(stats.map(s => s.department).filter(Boolean))];

    const handleExportStatsPDF = () => {
        const doc = new jsPDF();
        doc.text("Thong Ke Nhan Su", 20, 10);
        doc.autoTable({
            head: [['Nhan Vien', 'Phong Ban', 'Tong Gio']],
            body: filteredStats.map(i => [i.full_name, i.department || 'Chua cap nhat', parseFloat(i.total_hours || 0).toFixed(1) + 'h']),
        });
        doc.save('Thong_Ke_Nhan_Su.pdf');
    };

    const handleExportStatsExcel = () => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(filteredStats.map(i => ({
            'Tên Nhân Viên': i.full_name,
            'Phòng ban': i.department || 'Chưa cập nhật',
            'Tổng giờ': parseFloat(i.total_hours || 0).toFixed(1) + 'h'
        })));
        XLSX.utils.book_append_sheet(wb, ws, "Thong Ke");
        XLSX.writeFile(wb, "Thong_Ke_Nhan_Su.xlsx");
    };

    const handleSingleApprove = (id, actualGrade = 'C') => {
        axios.put('/work-logs/update-status', { id, status: 'Approved', actual_grade: actualGrade }).then(() => {
            message.success('Đã duyệt task!');
        }).catch(err => message.error('Lỗi khi duyệt task'));
    };

    const handleBulkApprove = (grade = 'C') => {
        const promises = selectedRowKeys.map(id => axios.put('/work-logs/update-status', { id, status: 'Approved', actual_grade: grade }));
        Promise.all(promises).then(() => {
            message.success(`Đã duyệt & đánh giá ${selectedRowKeys.length} task hạng ${grade}!`);
            setSelectedRowKeys([]);
        }).catch(err => message.error('Có lỗi xảy ra khi duyệt hàng loạt'));
    };

    const handleApproveEmployeeAllPending = (employeeId, grade = 'C') => {
        const empPending = pendingLogs.filter(log => String(log.user_id) === String(employeeId));
        if (empPending.length === 0) {
            message.info('Nhân viên này không có công việc nào chờ duyệt!');
            return;
        }
        const promises = empPending.map(log => axios.put('/work-logs/update-status', { id: log.id, status: 'Approved', actual_grade: grade }));
        Promise.all(promises).then(() => {
            message.success(`Đã duyệt & đánh giá ${empPending.length} task của nhân viên!`);
        }).catch(err => message.error('Có lỗi xảy ra khi duyệt'));
    };

    const openRejectModal = (id) => {
        setRejectTargetId(id);
        setRejectReason('');
        setRejectModalOpen(true);
    };

    const handleConfirmReject = () => {
        if (!rejectReason.trim()) {
            message.error('Vui lòng nhập lý do từ chối!');
            return;
        }
        axios.put('/work-logs/update-status', { id: rejectTargetId, status: 'Rejected', feedback: rejectReason }).then(() => {
            message.success('Đã từ chối task!');
            setRejectModalOpen(false);
        }).catch(err => message.error('Lỗi khi từ chối task'));
    };

    const handleAllowEdit = (id) => {
        axios.put('/work-logs/update-status', { id, status: 'Draft' }).then(() => {
            message.success('Đã cho phép nhân viên sửa!');
        }).catch(err => message.error('Lỗi khi cấp quyền sửa'));
    };

    const handleRejectEdit = (id) => {
        axios.put('/work-logs/update-status', { id, status: 'Approved' }).then(() => {
            message.success('Đã từ chối yêu cầu sửa!');
        }).catch(err => message.error('Lỗi khi từ chối yêu cầu'));
    };

    const pendingColumns = [
        {
            title: 'Thời gian',
            width: 100,
            render: (_, r) => <div style={{ color: '#64748b', fontSize: 13 }}>{dayjs(r.work_date).format('DD/MM/YYYY')}</div>
        },
        {
            title: 'Nhân viên',
            render: (_, r) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e0f2fe', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14 }}>
                        {r.full_name?.charAt(0) || 'U'}
                    </div>
                    <div style={{ color: '#0f172a', fontWeight: 600 }}>{r.full_name}</div>
                </div>
            )
        },
        {
            title: 'Nội dung ngắn',
            render: (_, r) => (
                <div>
                    <div style={{ fontWeight: 500, color: '#0f172a' }}>
                        {r.task_name || 'Công việc phát sinh'}
                        {r.status === 'Edit_Requested' && <Tag style={{ marginLeft: 8 }} color="purple">Yêu cầu sửa</Tag>}
                    </div>
                    <div style={{ color: '#64748b', fontSize: 13, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {r.status === 'Edit_Requested' ? (
                            <span><b>Lý do:</b> {r.edit_reason}</span>
                        ) : (
                            r.description || 'Không có mô tả'
                        )}
                    </div>
                </div>
            )
        },
        {
            title: 'Số giờ',
            dataIndex: 'hours',
            width: 80,
            render: (val) => <Tag style={{ borderRadius: 12, border: 'none', background: '#f0f9ff', color: '#0ea5e9', fontWeight: 500 }}>{val}h</Tag>
        },
        {
            title: 'Hành động',
            width: 220,
            render: (_, r) => (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                    {r.status === 'Pending' ? (
                        <>
                            <Select
                                value={rowGrades[r.id] || 'C'}
                                onChange={(val) => setRowGrades(prev => ({ ...prev, [r.id]: val }))}
                                style={{ width: 60 }}
                                className="quick-approve-select"
                                options={[
                                    { value: 'A', label: 'A' },
                                    { value: 'B', label: 'B' },
                                    { value: 'C', label: 'C' },
                                    { value: 'D', label: 'D' }
                                ]}
                            />
                            <Tooltip title={`Duyệt & Đánh giá nhanh hạng ${rowGrades[r.id] || 'C'}`}>
                                <Button
                                    type="text"
                                    className="quick-approve-btn quick-approve-btn-approve"
                                    icon={<CheckOutlined style={{ fontSize: 18 }} />}
                                    onClick={() => handleSingleApprove(r.id, rowGrades[r.id] || 'C')}
                                />
                            </Tooltip>
                            <Tooltip title="Từ chối">
                                <Button
                                    type="text"
                                    className="quick-approve-btn quick-approve-btn-reject"
                                    icon={<CloseOutlined style={{ fontSize: 18 }} />}
                                    onClick={() => openRejectModal(r.id)}
                                />
                            </Tooltip>
                        </>
                    ) : (
                        <>
                            <Tooltip title="Cho phép sửa (về Draft)"><Button type="text" style={{ color: '#9333ea', background: '#faf5ff', borderRadius: 8 }} icon={<EditOutlined />} onClick={() => handleAllowEdit(r.id)} /></Tooltip>
                            <Tooltip title="Từ chối sửa (giữ nguyên Approved)"><Button type="text" style={{ color: '#dc2626', background: '#fee2e2', borderRadius: 8 }} icon={<CloseOutlined />} onClick={() => handleRejectEdit(r.id)} /></Tooltip>
                        </>
                    )}
                </div>
            )
        }
    ];

    return (
        <div>
            <Tabs defaultActiveKey="1" items={[
                {
                    key: '1',
                    label: 'Thống kê Tổng quan',
                    children: (
                        <div style={{ fontFamily: "'Inter', 'Be Vietnam Pro', sans-serif" }}>
                            <style>{`
                .global-controls-bar .ant-input-affix-wrapper,
                .global-controls-bar .ant-select-selector,
                .global-controls-bar .ant-picker {
                  border-color: #e2e8f0 !important;
                  box-shadow: none !important;
                  border-radius: 8px !important;
                }
                .global-controls-bar .ant-input-affix-wrapper:focus-within,
                .global-controls-bar .ant-select-selector:focus-within,
                .global-controls-bar .ant-select-focused .ant-select-selector,
                .global-controls-bar .ant-picker-focused {
                  border-color: #3b82f6 !important;
                  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
                }
                .global-controls-bar .ant-select-selection-item,
                .global-controls-bar .ant-picker-input > input,
                .global-controls-bar input {
                   font-family: 'Inter', sans-serif !important;
                }
                .ant-table-tbody > tr.ant-table-row:hover > td {
                  background: #f8fafc !important;
                  transition: background 0.2s ease;
                }
                
                /* Custom quick approval styling */
                .quick-approve-btn {
                  width: 38px !important;
                  height: 38px !important;
                  border-radius: 50% !important;
                  display: inline-flex !important;
                  align-items: center;
                  justify-content: center;
                  transition: all 0.2s ease-in-out !important;
                  border: none !important;
                  cursor: pointer;
                }
                .quick-approve-btn-approve {
                  color: #10b981 !important;
                  background-color: #dcfce7 !important;
                  box-shadow: 0 4px 10px rgba(16, 185, 129, 0.1) !important;
                }
                .quick-approve-btn-approve:hover {
                  color: #ffffff !important;
                  background-color: #10b981 !important;
                  transform: scale(1.08);
                  box-shadow: 0 6px 14px rgba(16, 185, 129, 0.25) !important;
                }
                .quick-approve-btn-approve:active {
                  transform: scale(0.95);
                }
                
                .quick-approve-btn-reject {
                  color: #ef4444 !important;
                  background-color: #fee2e2 !important;
                  box-shadow: 0 4px 10px rgba(239, 68, 68, 0.1) !important;
                }
                .quick-approve-btn-reject:hover {
                  color: #ffffff !important;
                  background-color: #ef4444 !important;
                  transform: scale(1.08);
                  box-shadow: 0 6px 14px rgba(239, 68, 68, 0.25) !important;
                }
                .quick-approve-btn-reject:active {
                  transform: scale(0.95);
                }
                
                .quick-approve-select .ant-select-selector {
                  height: 38px !important;
                  border-radius: 8px !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  border-color: #cbd5e1 !important;
                }
             `}</style>

                            {/* Global Controls */}
                            <div className="global-controls-bar" style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 24,
                                padding: '16px 20px',
                                background: '#fff',
                                borderRadius: 16,
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.02)'
                            }}>
                                <div style={{ display: 'flex', gap: 16, flex: 1, flexWrap: 'wrap' }}>
                                    <Input
                                        size="large"
                                        prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                                        placeholder="Tìm kiếm nhân viên..."
                                        value={searchText}
                                        onChange={e => setSearchText(e.target.value)}
                                        style={{ width: 280 }}
                                    />
                                    <Select
                                        size="large"
                                        placeholder="Phòng ban"
                                        value={filterDept}
                                        onChange={setFilterDept}
                                        style={{ width: 160 }}
                                        options={[
                                            { value: 'all', label: 'Tất cả phòng ban' },
                                            ...departments.map(d => ({ value: d, label: d }))
                                        ]}
                                    />
                                    <Select
                                        size="large"
                                        placeholder="Trạng thái"
                                        value={filterStatus}
                                        onChange={setFilterStatus}
                                        style={{ width: 160 }}
                                        options={[
                                            { value: 'all', label: 'Tất cả trạng thái' },
                                            { value: 'active', label: 'Đang làm việc' },
                                            { value: 'leave', label: 'Nghỉ phép' }
                                        ]}
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <Tooltip title="Dữ liệu sẽ được xuất dựa trên bộ lọc hiện tại">
                                        <InfoCircleOutlined style={{ color: '#94a3b8', fontSize: 18, cursor: 'help' }} />
                                    </Tooltip>
                                    <Dropdown menu={{
                                        items: [
                                            { key: 'excel', label: 'Tải file Excel (.xlsx)', icon: <FileExcelOutlined style={{ color: '#10b981' }} />, onClick: handleExportStatsExcel },
                                            { key: 'pdf', label: 'Tải file PDF (.pdf)', icon: <FilePdfOutlined style={{ color: '#ef4444' }} />, onClick: handleExportStatsPDF }
                                        ]
                                    }}>
                                        <Button style={{ borderRadius: 8, height: 40, fontWeight: 500, color: '#475569', borderColor: '#e2e8f0', background: '#f8fafc' }}>
                                            Xuất báo cáo <DownOutlined />
                                        </Button>
                                    </Dropdown>
                                    <DatePicker.RangePicker
                                        size="large"
                                        value={dateRange}
                                        onChange={setDateRange}
                                        presets={[
                                            { label: 'Tuần này', value: [dayjs().startOf('week'), dayjs().endOf('week')] },
                                            { label: '30 ngày qua', value: [dayjs().subtract(30, 'd'), dayjs()] },
                                            { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs().endOf('month')] }
                                        ]}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '32px' }}>
                                {/* Card 1: Nhân sự */}
                                <Card style={{ borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }} bodyStyle={{ padding: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8, fontWeight: 500 }}>Nhân sự</div>
                                            <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1, marginBottom: 8 }}>{filteredStats.length}</div>
                                            <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}></div>
                                        </div>
                                        <div style={{ width: 44, height: 44, borderRadius: '10px', background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0ea5e9', fontSize: 20 }}>
                                            <UserOutlined />
                                        </div>
                                    </div>
                                </Card>

                                {/* Card 2: Tổng giờ */}
                                <Card style={{ borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }} bodyStyle={{ padding: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8, fontWeight: 500 }}>Tổng giờ Approved</div>
                                            <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1, marginBottom: 8 }}>{filteredStats.reduce((sum, i) => sum + parseFloat(i.total_hours || 0), 0).toFixed(1)}<span style={{ fontSize: 14, color: '#64748b', marginLeft: 4, fontWeight: 500 }}>h</span></div>
                                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Toàn dự án</div>
                                        </div>
                                        <div style={{ width: 44, height: 44, borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontSize: 20 }}>
                                            <ClockCircleOutlined />
                                        </div>
                                    </div>
                                </Card>

                                {/* Card 3: Task chờ duyệt */}
                                <Card
                                    hoverable
                                    onClick={() => setPendingDrawerOpen(true)}
                                    style={{ borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9', cursor: 'pointer' }}
                                    bodyStyle={{ padding: '20px' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8, fontWeight: 500 }}>Task chờ duyệt</div>
                                            <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1, marginBottom: 8 }}>{filteredPendingLogs.length}</div>
                                            <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 500 }}>Cần duyệt ngay</div>
                                        </div>
                                        <div style={{ width: 44, height: 44, borderRadius: '10px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', fontSize: 20 }}>
                                            <HourglassOutlined />
                                        </div>
                                    </div>
                                </Card>

                                {/* Card 4: Cảnh báo */}
                                <Card
                                    hoverable
                                    onClick={() => setOverdueDrawerOpen(true)}
                                    style={{ borderRadius: 12, boxShadow: overdueTasks.length > 0 ? '0 0 15px rgba(239,68,68,0.3)' : '0 2px 10px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'all 0.3s' }}
                                    bodyStyle={{ padding: '20px' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8, fontWeight: 500 }}>Cảnh báo quá hạn</div>
                                            <div style={{ fontSize: 28, fontWeight: 700, color: overdueTasks.length > 0 ? '#ef4444' : '#0f172a', lineHeight: 1, marginBottom: 8 }}>{overdueTasks.length}</div>
                                            {overdueTasks.length === 0 ? (
                                                <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}><CheckCircleOutlined /> Mọi thứ đang đúng tiến độ</div>
                                            ) : (
                                                <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>Task đang bị trễ</div>
                                            )}
                                        </div>
                                        <div style={{ width: 44, height: 44, borderRadius: '10px', background: overdueTasks.length > 0 ? '#fef2f2' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: overdueTasks.length > 0 ? '#ef4444' : '#10b981', fontSize: 20 }}>
                                            <BellOutlined />
                                        </div>
                                    </div>
                                </Card>
                            </div>
                            <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', background: '#fff' }}>
                                <Table
                                    dataSource={filteredStats}
                                    columns={mainColumns}
                                    rowKey="id"
                                    pagination={{
                                        pageSize: 10,
                                        showSizeChanger: true,
                                        pageSizeOptions: ['5', '10', '20'],
                                        showTotal: (total, range) => `${range[0]}-${range[1]} của ${total} nhân viên`
                                    }}
                                    style={{ '--ant-component-background': 'transparent' }}
                                />
                            </div>
                        </div>
                    )
                },
                {
                    key: '2',
                    label: 'Leaderboard & Hình phạt/Thưởng',
                    children: (
                        <div style={{ fontFamily: "'Inter', 'Be Vietnam Pro', sans-serif" }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fefce8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ca8a04' }}>
                                        <TrophyOutlined />
                                    </div>
                                    Bảng Xếp Hạng Năng Lực
                                </h2>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <DatePicker
                                        picker="month"
                                        format="MM/YYYY"
                                        value={leaderboardMonth}
                                        onChange={(date) => {
                                            if (date) {
                                                setLeaderboardMonth(date);
                                                fetchLeaderboard(date);
                                            }
                                        }}
                                        style={{ borderRadius: 8 }}
                                        allowClear={false}
                                    />
                                    <Button type="text" icon={<ExportOutlined />} onClick={handleExportPDF} style={{ background: '#f8fafc', color: '#475569', borderRadius: 8, fontWeight: 500 }}>PDF</Button>
                                    <Button type="text" icon={<ExportOutlined />} onClick={handleExportExcel} style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: 8, fontWeight: 500 }}>Excel</Button>
                                </div>
                            </div>
                            <Row gutter={24}>
                                <Col span={12}>
                                    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', background: '#fff' }}>
                                        <Table dataSource={leaderboard} rowKey="id" pagination={{ pageSize: 5 }} style={{ '--ant-component-background': 'transparent' }} columns={[
                                            { title: 'Top', render: (t, r, idx) => <span style={{ color: '#94a3b8', fontWeight: 600 }}>#{idx + 1}</span> },
                                            { title: 'Nhân viên', dataIndex: 'full_name', render: t => <b style={{ color: '#0f172a', fontWeight: 600 }}>{t}</b> },
                                            { title: 'Điểm', dataIndex: 'accumulated_points', render: v => <Tag style={{ borderRadius: 12, border: 'none', background: '#fefce8', color: '#ca8a04', fontWeight: 600, padding: '2px 10px' }}>{v}</Tag> },
                                            {
                                                title: 'Tiến độ KPI', dataIndex: 'completion_percent', render: (v, r) => {
                                                    const isExcellent = v >= (r.excellent_points / r.target_points) * 100;
                                                    const isPassed = v >= 100;
                                                    return (
                                                        <div>
                                                            <div style={{ fontWeight: 600, color: isExcellent ? '#9333ea' : (isPassed ? '#16a34a' : '#0ea5e9') }}>{v}%</div>
                                                            <div style={{ fontSize: 11, color: '#64748b' }}>Mục tiêu: {r.target_points}</div>
                                                        </div>
                                                    );
                                                }
                                            }
                                        ]} />
                                    </div>
                                </Col>
                                <Col span={12}>
                                    <Card style={{ borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }} bodyStyle={{ padding: 24 }}>
                                        <div style={{ height: 320 }}>
                                            <Bar
                                                data={{
                                                    labels: leaderboard.map(i => i.full_name),
                                                    datasets: [{
                                                        label: 'Điểm Tích Lũy',
                                                        data: leaderboard.map(i => i.accumulated_points),
                                                        backgroundColor: (context) => {
                                                            const chart = context.chart;
                                                            const { ctx, chartArea } = chart;
                                                            if (!chartArea) return '#0ea5e9';
                                                            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                                                            gradient.addColorStop(0, '#e0f2fe'); // sky-100
                                                            gradient.addColorStop(1, '#0ea5e9'); // sky-500
                                                            return gradient;
                                                        },
                                                        borderRadius: 8,
                                                        borderSkipped: false,
                                                        hoverBackgroundColor: '#0284c7' // sky-600
                                                    }]
                                                }}
                                                options={{
                                                    maintainAspectRatio: false,
                                                    plugins: {
                                                        legend: { display: false },
                                                        tooltip: {
                                                            backgroundColor: '#0f172a',
                                                            padding: 12,
                                                            titleFont: { size: 14, family: "'Inter', sans-serif" },
                                                            bodyFont: { size: 13, family: "'Inter', sans-serif" },
                                                            cornerRadius: 8,
                                                            displayColors: false,
                                                            callbacks: {
                                                                label: (context) => `Điểm: ${context.parsed.y}`
                                                            }
                                                        }
                                                    },
                                                    scales: {
                                                        x: {
                                                            grid: { display: false, drawBorder: false },
                                                            ticks: { font: { family: "'Inter', sans-serif" }, color: '#64748b' },
                                                            border: { display: false }
                                                        },
                                                        y: {
                                                            grid: { color: '#f1f5f9', drawBorder: false, strokeDash: [4, 4] },
                                                            ticks: { font: { family: "'Inter', sans-serif" }, color: '#64748b', padding: 10 },
                                                            border: { display: false }
                                                        }
                                                    },
                                                    interaction: {
                                                        mode: 'index',
                                                        intersect: false,
                                                    }
                                                }}
                                            />
                                        </div>
                                    </Card>
                                </Col>
                            </Row>
                        </div>
                    )
                },
                {
                    key: '3',
                    label: 'Giao Việc (Push Task)',
                    children: (
                        <div style={{ fontFamily: "'Inter', 'Be Vietnam Pro', sans-serif" }}>
                            <Row gutter={32}>
                                <Col span={14}>
                                    <Card
                                        title={<span style={{ fontSize: 18, color: '#0f172a', fontWeight: 600 }}>{currentDraftId ? `Giao Việc (Từ Danh sách chờ #${currentDraftId})` : "Giao Việc Mới"}</span>}
                                        style={{ borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}
                                        bodyStyle={{ padding: 32 }}
                                    >
                                        <Form form={assignForm} layout="vertical" onFinish={submitAssignTask} requiredMark={false}>
                                            <Form.Item name="task_group" label={<span style={{ color: '#475569', fontWeight: 500 }}>Tên Dự Án / Nhóm Việc <span style={{ color: '#ef4444' }}>*</span></span>} rules={[{ required: true, message: 'Vui lòng nhập tên dự án / nhóm việc!' }]}>
                                                <AutoComplete
                                                    options={projectSuggestions}
                                                    placeholder="Tìm hoặc nhập dự án mới..."
                                                    filterOption={(inputValue, option) => option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}
                                                    dropdownRender={menu => (
                                                        <>
                                                            {menu}
                                                            <div style={{ padding: '8px', borderTop: '1px solid #f1f5f9', display: 'flex' }}>
                                                                <Button type="link" size="small" icon={<PlusCircleOutlined />}
                                                                    onClick={() => {
                                                                        const currentVal = assignForm.getFieldValue('task_group');
                                                                        if (currentVal && !projectSuggestions.find(i => i.value === currentVal)) {
                                                                            setProjectSuggestions([...projectSuggestions, { value: currentVal }]);
                                                                            message.success("Đã thêm vào bộ nhớ tạm!");
                                                                        }
                                                                    }}>
                                                                    Lưu nhanh tùy chọn này
                                                                </Button>
                                                            </div>
                                                        </>
                                                    )}
                                                    style={{ height: 40 }}
                                                    className="modern-input"
                                                />
                                            </Form.Item>
                                            <Form.Item name="task_name" label={<span style={{ color: '#475569', fontWeight: 500 }}>Tên Tác Vụ <span style={{ color: '#ef4444' }}>*</span></span>} rules={[{ required: true, message: 'Vui lòng nhập tên tác vụ!' }]}>
                                                <AutoComplete
                                                    options={taskSuggestions}
                                                    placeholder="Tìm hoặc nhập tên tác vụ mới..."
                                                    filterOption={(inputValue, option) => option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}
                                                    dropdownRender={menu => (
                                                        <>
                                                            {menu}
                                                            <div style={{ padding: '8px', borderTop: '1px solid #f1f5f9', display: 'flex' }}>
                                                                <Button type="link" size="small" icon={<PlusCircleOutlined />}
                                                                    onClick={() => {
                                                                        const currentVal = assignForm.getFieldValue('task_name');
                                                                        if (currentVal && !taskSuggestions.find(i => i.value === currentVal)) {
                                                                            setTaskSuggestions([...taskSuggestions, { value: currentVal }]);
                                                                            message.success("Đã thêm vào bộ nhớ tạm!");
                                                                        }
                                                                    }}>
                                                                    Lưu nhanh tùy chọn này
                                                                </Button>
                                                            </div>
                                                        </>
                                                    )}
                                                    style={{ height: 40 }}
                                                    className="modern-input"
                                                />
                                            </Form.Item>
                                            <Form.Item name="description" label={<span style={{ color: '#475569', fontWeight: 500 }}>Mô tả / Yêu cầu công việc</span>}>
                                                <Input.TextArea rows={3} style={{ borderRadius: 8, borderColor: '#e2e8f0', padding: 12 }} />
                                            </Form.Item>
                                            <Form.Item label={<span style={{ color: '#475569', fontWeight: 500 }}>Đính kèm tài liệu</span>}>
                                                <Upload.Dragger
                                                    key={uploadedFile ? uploadedFile.url : 'empty'}
                                                    name="file"
                                                    customRequest={({ file, onSuccess, onError }) => {
                                                        const formData = new FormData();
                                                        formData.append('file', file);
                                                        axios.post('/upload', formData).then(res => {
                                                            onSuccess(res.data);
                                                        }).catch(err => {
                                                            onError(err);
                                                        });
                                                    }}
                                                    onChange={(info) => {
                                                        if (info.file.status === 'done') {
                                                            setUploadedFile({ url: info.file.response.attachmentUrl, name: info.file.name });
                                                            message.success(`${info.file.name} tải lên thành công.`);
                                                        } else if (info.file.status === 'error') {
                                                            message.error(`${info.file.name} tải lên thất bại.`);
                                                        }
                                                    }}
                                                    onRemove={() => setUploadedFile(null)}
                                                    maxCount={1}
                                                    defaultFileList={uploadedFile ? [{ uid: '-1', name: uploadedFile.name, status: 'done', url: uploadedFile.url }] : []}
                                                >
                                                    <p className="ant-upload-drag-icon"><PaperClipOutlined style={{ color: '#3b82f6' }} /></p>
                                                    <p className="ant-upload-text" style={{ color: '#0f172a', fontWeight: 500 }}>Kéo thả hoặc nhấn vào đây để tải file đính kèm lên</p>
                                                    <p className="ant-upload-hint" style={{ color: '#64748b', fontSize: 13, marginTop: 8, padding: '0 16px' }}>
                                                        Hỗ trợ: .doc, .docx, .xls, .xlsx, .ppt, .pptx, .pdf, .csv, .json, .png, .jpg, .txt, .zip, .rar (Tối đa 10MB)
                                                    </p>
                                                </Upload.Dragger>
                                            </Form.Item>
                                            <Form.Item label={<span style={{ color: '#475569', fontWeight: 500 }}>Deadline (Hạn chót)</span>}>
                                                <Input.Group compact style={{ display: 'flex' }}>
                                                    <Form.Item name="deadlineDate" noStyle>
                                                        <DatePicker style={{ width: '60%', borderRadius: '8px 0 0 8px', height: 40 }} placeholder="Chọn ngày (mặc định hôm nay)" format="YYYY-MM-DD" />
                                                    </Form.Item>
                                                    <Form.Item name="deadlineTime" noStyle>
                                                        <TimePicker style={{ width: '40%', borderRadius: '0 8px 8px 0', height: 40 }} placeholder="Chọn giờ" format="HH:mm:ss" />
                                                    </Form.Item>
                                                </Input.Group>
                                                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Nếu chỉ nhập Giờ, hệ thống mặc định là Hôm nay.</div>
                                            </Form.Item>
                                            <Row gutter={24}>
                                                <Col span={12}>
                                                    <Form.Item name="priority" label={<span style={{ color: '#475569', fontWeight: 500 }}>Độ Ưu Tiên (Priority)</span>} initialValue="C">
                                                        <Segmented
                                                            block
                                                            options={[
                                                                { label: <div style={{ padding: '4px 0', color: '#ef4444', fontWeight: 600 }}>A (Khẩn)</div>, value: 'A' },
                                                                { label: <div style={{ padding: '4px 0', color: '#3b82f6', fontWeight: 600 }}>B (Cao)</div>, value: 'B' },
                                                                { label: <div style={{ padding: '4px 0', color: '#f97316', fontWeight: 600 }}>C (Vừa)</div>, value: 'C' },
                                                                { label: <div style={{ padding: '4px 0', color: '#64748b', fontWeight: 600 }}>D (Thấp)</div>, value: 'D' },
                                                            ]}
                                                            style={{ background: '#f8fafc', padding: 4, borderRadius: 8 }}
                                                        />
                                                    </Form.Item>
                                                </Col>
                                                <Col span={12}>
                                                    <Form.Item name="expected_grade" label={<span style={{ color: '#475569', fontWeight: 500 }}>Kỳ Vọng Hạng</span>} initialValue="C">
                                                        <Segmented
                                                            block
                                                            options={[
                                                                { label: <div style={{ padding: '4px 0', color: '#16a34a', fontWeight: 600 }}>A</div>, value: 'A' },
                                                                { label: <div style={{ padding: '4px 0', color: '#0ea5e9', fontWeight: 600 }}>B</div>, value: 'B' },
                                                                { label: <div style={{ padding: '4px 0', color: '#ca8a04', fontWeight: 600 }}>C</div>, value: 'C' },
                                                                { label: <div style={{ padding: '4px 0', color: '#475569', fontWeight: 600 }}>D</div>, value: 'D' },
                                                            ]}
                                                            style={{ background: '#f8fafc', padding: 4, borderRadius: 8 }}
                                                        />
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                            <Form.Item name="assigned_to" label={<span style={{ color: '#475569', fontWeight: 500 }}>Giao Cho Ai? <span style={{ color: '#ef4444' }}>*</span></span>} rules={[{ required: true, message: 'Chọn ít nhất 1 nhân sự!' }]}>
                                                <Select
                                                    ref={assignSelectRef}
                                                    mode="multiple"
                                                    placeholder="Từ Danh Sách Nháp có thể giao ngay nhiều người..."
                                                    options={stats.map(s => ({ value: s.id, label: s.full_name }))}
                                                    optionRender={(option) => (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#e0f2fe', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold' }}>
                                                                {option.label.charAt(0)}
                                                            </div>
                                                            {option.label}
                                                        </div>
                                                    )}
                                                    onInputKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            assignSelectRef.current?.blur();
                                                        }
                                                    }}
                                                    style={{ minHeight: 40 }}
                                                    className="modern-select"
                                                />
                                            </Form.Item>

                                            <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 32 }}>
                                                <Button onClick={() => { setCurrentDraftId(null); assignForm.resetFields(); setUploadedFile(null); }} style={{ borderRadius: 8, height: 40 }}>Xóa trắng</Button>
                                                <Button icon={<SaveOutlined />} onClick={handleSaveDraft} style={{ background: '#fefce8', color: '#ca8a04', border: 'none', borderRadius: 8, height: 40, fontWeight: 500 }}>Lưu DS chờ</Button>
                                                <Button type="primary" htmlType="submit" style={{ background: '#3b82f6', border: 'none', borderRadius: 8, height: 40, fontWeight: 500, padding: '0 24px', boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.39)' }}>Giao Việc Ngay</Button>
                                            </div>
                                        </Form>
                                    </Card>
                                </Col>
                                <Col span={10}>
                                    <Card
                                        title={<span style={{ fontSize: 18, color: '#0f172a', fontWeight: 600 }}>Danh Sách Chờ (Task Bank)</span>}
                                        style={{ borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}
                                        bodyStyle={{ padding: 0, maxHeight: '600px', overflowY: 'auto' }}
                                    >
                                        <List
                                            itemLayout="horizontal"
                                            dataSource={draftTasks}
                                            renderItem={item => {
                                                const getPriorityColor = (p) => {
                                                    if (p === 'A') return { bg: '#fee2e2', color: '#ef4444' };
                                                    if (p === 'B') return { bg: '#dbeafe', color: '#3b82f6' };
                                                    if (p === 'C') return { bg: '#ffedd5', color: '#f97316' };
                                                    return { bg: '#f1f5f9', color: '#64748b' };
                                                };
                                                return (
                                                    <List.Item style={{ padding: '16px 24px', cursor: 'default', transition: 'all 0.2s', borderBottom: '1px solid #f8fafc', backgroundColor: currentDraftId === item.id ? '#f8fafc' : '#fff' }} className="task-bank-item">
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                                            <div>
                                                                <div style={{ color: '#0f172a', fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{item.task_name}</div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                    <Tag style={{ borderRadius: 16, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '2px 10px', fontWeight: 500 }}>{item.task_group}</Tag>
                                                                    {item.deadline && <Tag style={{ borderRadius: 16, background: '#fef2f2', color: '#ef4444', border: 'none', padding: '2px 10px', fontWeight: 500 }}>{dayjs(item.deadline).format('DD/MM/YYYY')}</Tag>}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: getPriorityColor(item.priority).bg, color: getPriorityColor(item.priority).color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                                                    {item.priority}
                                                                </div>
                                                                <Button type="primary" size="small" style={{ borderRadius: 6, background: '#10b981', border: 'none', fontWeight: 500, boxShadow: '0 2px 8px rgba(16,185,129,0.2)' }} onClick={() => selectDraft(item)}>Sử dụng</Button>
                                                            </div>
                                                        </div>
                                                    </List.Item>
                                                );
                                            }}
                                            locale={{ emptyText: 'Chưa có task nào trong ds chờ' }}
                                        />
                                    </Card>
                                </Col>
                            </Row>
                        </div>
                    )
                },
                {
                    key: '4',
                    label: 'Cấu Hình KPI',
                    children: (
                        <Card style={{ maxWidth: 600, margin: '0 auto', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }} bodyStyle={{ padding: 32 }}>
                            <Title level={4} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, marginTop: 0 }}><SettingOutlined style={{ color: '#3b82f6' }} /> Thông Số Tính KPI</Title>
                            <Form form={kpiForm} layout="vertical" onFinish={saveKpiSettings}>
                                <Form.Item name="eval_month" label={<span style={{ fontWeight: 500 }}>Kỳ đánh giá (Tháng)</span>} rules={[{ required: true }]}>
                                    <DatePicker picker="month" format="MM/YYYY" style={{ width: '100%', height: 40, borderRadius: 8 }} />
                                </Form.Item>
                                <Form.Item name="target_points" label={<span style={{ fontWeight: 500 }}>Điểm KPI Mục tiêu để Đạt</span>} rules={[{ required: true }]} tooltip="Nhân viên đạt đủ số điểm này sẽ hiển thị trạng thái ĐÃ ĐẠT KPI">
                                    <InputNumber min={1} style={{ width: '100%', height: 40, borderRadius: 8 }} />
                                </Form.Item>
                                <Form.Item name="excellent_points" label={<span style={{ fontWeight: 500 }}>Điểm KPI Mục tiêu Xuất sắc</span>} rules={[{ required: true }]} tooltip="Mốc để xét thưởng thêm năng suất">
                                    <InputNumber min={1} style={{ width: '100%', height: 40, borderRadius: 8 }} />
                                </Form.Item>

                                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px dashed #cbd5e1' }}>
                                    <div style={{ fontWeight: 600, marginBottom: 8, color: '#0f172a' }}>📋 Bảng quy đổi điểm mặc định hệ thống:</div>
                                    <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
                                        Task Mức <b>A</b>: <Tag color="green">5 điểm</Tag> | Task Mức <b>B</b>: <Tag color="blue">4 điểm</Tag> | Task Mức <b>C</b>: <Tag color="orange">3 điểm</Tag> <br /> Task Mức <b>D</b>: <Tag color="red">2 điểm</Tag> | Task Mức <b>E</b>: <Tag color="default">1 điểm</Tag>
                                    </div>
                                </div>

                                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} style={{ background: '#3b82f6', border: 'none', borderRadius: 8, height: 40, fontWeight: 500, width: '100%', boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.39)' }}>Lưu Cấu Hình</Button>
                            </Form>
                        </Card>
                    )
                }
            ]} />

            {/* MODAL CHI TIẾT NHÂN VIÊN */}
            <Modal title={`Chi tiết: ${selectedEmployee?.full_name}`} open={isModalOpen} onCancel={() => setIsModalOpen(false)} width={1000} footer={null}>
                <Card size="small" title="🛠 Bổ sung công việc (Quyền Manager)" style={{ marginBottom: 20, background: '#f6ffed', borderColor: '#b7eb8f' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <DatePicker value={newLog.date} onChange={(v) => setNewLog({ ...newLog, date: v })} placeholder="Chọn ngày..." />
                        <Select style={{ width: 200 }} value={newLog.taskId} onChange={(v) => setNewLog({ ...newLog, taskId: v })} placeholder="Chọn việc..." options={tasks.map(t => ({ value: t.id, label: t.task_name }))} />
                        <InputNumber value={newLog.hours} onChange={(v) => setNewLog({ ...newLog, hours: v })} placeholder="Giờ" min={0.1} max={24} />
                        <Input value={newLog.desc} onChange={(e) => setNewLog({ ...newLog, desc: e.target.value })} placeholder="Mô tả..." />
                        <Button type="primary" icon={<PlusCircleOutlined />} onClick={handleManagerAddLog}>Thêm</Button>
                    </div>
                </Card>
                <Table dataSource={employeeLogs} columns={detailColumns} rowKey="id" pagination={{ pageSize: 5 }} scroll={{ x: 800 }} />
            </Modal>

            {/* MODAL ĐÁNH GIÁ (REVIEW) */}
            <Modal title="Đánh Giá Chi Tiết Công Việc" open={reviewModalOpen} onCancel={() => setReviewModalOpen(false)} onOk={confirmReview} width={800} okText="Lưu Đánh Giá" cancelText="Hủy">
                <Row gutter={24}>
                    {/* Cột trái: Thông tin hiển thị */}
                    <Col span={12} style={{ borderRight: '1px solid #f0f0f0' }}>
                        <Title level={5} style={{ color: '#1890ff', marginBottom: 15 }}>📋 Thông Tin Đối Chiếu</Title>

                        <div style={{ marginBottom: 10 }}>
                            <b>🔹 Giao Việc (Manager):</b>
                            <div style={{ background: '#fafafa', padding: 10, borderRadius: 5, marginTop: 5 }}>
                                <div><b>Task:</b> {reviewLog?.task_name}</div>
                                <div><b>Priority:</b> <Tag color="volcano">{reviewLog?.priority || 'C'}</Tag></div>
                                <div><b>Mô tả Yêu cầu:</b> <i>{reviewLog?.task_desc || 'Không có mô tả'}</i></div>
                            </div>
                        </div>

                        <div>
                            <b>🔸 Thực Tế (Staff Báo Cáo):</b>
                            <div style={{ background: '#f6ffed', padding: 10, borderRadius: 5, marginTop: 5 }}>
                                <div><b>Nội dung làm:</b> {reviewLog?.description || 'Không có nội dung'}</div>
                                <div><b>Số giờ:</b> <Tag color="blue">{reviewLog?.hours}h</Tag></div>
                                <div style={{ marginTop: 5 }}><b>Đính kèm:</b>
                                    {reviewLog?.attachment_url ? (
                                        <a href={`${process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'}${reviewLog.attachment_url}`} target="_blank" rel="noreferrer" style={{ marginLeft: 5, display: 'inline-block' }}>
                                            <PaperClipOutlined /> Tải File Báo Cáo
                                        </a>
                                    ) : <span style={{ color: '#999', marginLeft: 5 }}>Không có</span>}
                                </div>
                            </div>
                        </div>
                    </Col>

                    {/* Cột phải: Form nhập liệu */}
                    <Col span={12}>
                        <Title level={5} style={{ color: '#1890ff', marginBottom: 15 }}>📝 Quyết Định Đánh Giá</Title>
                        <Form form={reviewForm} layout="vertical">
                            <Form.Item name="status" label="Hành Động Trạng Thái">
                                <Select options={[{ value: 'Approved', label: '✅ Phê Duyệt (Approved)' }, { value: 'Rejected', label: '❌ Từ Chối (Rejected)' }, { value: 'Draft', label: '✏️ Phê duyệt cho sửa (Draft)' }, { value: 'Pending', label: '⏳ Cho Phép Sửa Lại (Pending)' }]} />
                            </Form.Item>
                            <Form.Item name="actual_grade" label="Xếp Hạng Thực Tế (Actual Grade)">
                                <Select options={[{ value: 'A', label: '🌟 Hạng A (Tuyệt Vời)' }, { value: 'B', label: '👍 Hạng B (Tốt)' }, { value: 'C', label: '👌 Hạng C (Đạt)' }, { value: 'D', label: '👎 Hạng D (Kém)' }]} />
                            </Form.Item>
                            <Form.Item name="feedback" label="Phản Hồi (Feedback)">
                                <Input.TextArea rows={6} placeholder="Nhập nhận xét chi tiết để nhân viên rút kinh nghiệm..." />
                            </Form.Item>
                        </Form>
                    </Col>
                </Row>
            </Modal>
            <Drawer
                title={<div style={{ fontSize: 18, fontWeight: 600 }}>Duyệt công việc nhanh</div>}
                width={720}
                placement="right"
                onClose={() => { setPendingDrawerOpen(false); setSelectedRowKeys([]); }}
                open={pendingDrawerOpen}
                bodyStyle={{ padding: 0, background: '#f8fafc' }}
            >
                <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
                    <div>
                        <span style={{ fontWeight: 500, color: '#0f172a' }}>Đã chọn: <span style={{ color: '#0ea5e9', fontWeight: 700 }}>{selectedRowKeys.length}</span> task</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>Đánh giá nhanh:</span>
                        <Select
                            size="middle"
                            value={bulkGrade}
                            onChange={setBulkGrade}
                            style={{ width: 65 }}
                            options={[
                                { value: 'A', label: 'A' },
                                { value: 'B', label: 'B' },
                                { value: 'C', label: 'C' },
                                { value: 'D', label: 'D' }
                            ]}
                        />
                        <Button type="primary" style={{ background: '#10b981', borderRadius: 8, fontWeight: 500, boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }} disabled={selectedRowKeys.length === 0} onClick={() => handleBulkApprove(bulkGrade)}>Duyệt tất cả</Button>
                    </div>
                </div>
                <div style={{ padding: 24 }}>
                    <Table
                        rowSelection={{
                            selectedRowKeys,
                            onChange: (keys) => setSelectedRowKeys(keys),
                        }}
                        columns={pendingColumns}
                        dataSource={filteredPendingLogs}
                        rowKey="id"
                        pagination={false}
                        style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}
                        expandable={{
                            expandedRowRender: record => {
                                const baseURL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
                                return (
                                    <div style={{ padding: '16px 24px', background: '#f8fafc', borderRadius: 8, margin: '8px 16px', border: '1px dashed #cbd5e1' }}>
                                        <div style={{ marginBottom: 8 }}><span style={{ color: '#64748b', fontWeight: 500 }}>Chi tiết công việc:</span> <span style={{ color: '#0f172a' }}>{record.description || 'Không có mô tả chi tiết.'}</span></div>
                                        {record.attachment_url && (
                                            <div><span style={{ color: '#64748b', fontWeight: 500 }}>Minh chứng:</span> <a href={`${baseURL}${record.attachment_url}`} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', fontWeight: 500 }}><PaperClipOutlined /> {record.attachment_name || 'Xem file đính kèm'}</a></div>
                                        )}
                                    </div>
                                )
                            },
                            expandRowByClick: true
                        }}
                    />
                </div>
            </Drawer>

            <Modal
                title="Từ chối phê duyệt"
                open={rejectModalOpen}
                onOk={handleConfirmReject}
                onCancel={() => setRejectModalOpen(false)}
                okText="Gửi phản hồi"
                cancelText="Hủy"
                okButtonProps={{ danger: true, style: { borderRadius: 8 } }}
                cancelButtonProps={{ style: { borderRadius: 8 } }}
            >
                <p style={{ color: '#64748b', marginBottom: 16 }}>Vui lòng cung cấp lý do từ chối để nhân sự biết và điều chỉnh lại báo cáo.</p>
                <Input.TextArea
                    placeholder="Ví dụ: Thiếu task detail, Số giờ không khớp..."
                    rows={4}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    style={{ borderRadius: 8 }}
                />
            </Modal>

            <Drawer
                title={<div style={{ fontSize: 18, fontWeight: 600, color: '#ef4444' }}>Cảnh báo quá hạn</div>}
                width={600}
                placement="right"
                onClose={() => setOverdueDrawerOpen(false)}
                open={overdueDrawerOpen}
                bodyStyle={{ padding: 24, background: '#f8fafc' }}
            >
                <List
                    itemLayout="horizontal"
                    dataSource={overdueTasks}
                    renderItem={item => (
                        <List.Item style={{ padding: '16px 24px', background: '#fff', borderRadius: 12, marginBottom: 16, border: '1px solid #fecaca', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.05)' }}>
                            <div style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 15 }}>{item.task_name}</div>
                                    <Tag color="error" style={{ borderRadius: 12, fontWeight: 600 }}>Quá hạn {item.overdueHours} giờ</Tag>
                                </div>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#e0f2fe', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold' }}>
                                        {item.staffName.charAt(0)}
                                    </div>
                                    <span style={{ color: '#475569', fontWeight: 500 }}>{item.staffName}</span>
                                    <span style={{ color: '#cbd5e1' }}>|</span>
                                    <span style={{ color: '#64748b', fontSize: 13 }}>Deadline: {dayjs(item.deadline).format('DD/MM/YYYY HH:mm')}</span>
                                </div>
                            </div>
                        </List.Item>
                    )}
                    locale={{ emptyText: 'Mọi thứ đang đúng tiến độ!' }}
                />
            </Drawer>
        </div>
    );
}