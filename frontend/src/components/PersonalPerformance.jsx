import React, { useState } from 'react';
import { DatePicker, Row, Col, Table, Tag, Typography, Card, Space, Button } from 'antd';
import { Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { ClockCircleOutlined, TrophyOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const { Title: AntTitle, Text } = Typography;

// Removed MOCK_DATA

const RANK_COLORS = {
  A: { bg: '#dcfce7', text: '#166534', solid: '#10b981' }, // Green
  B: { bg: '#dbeafe', text: '#1e3a8a', solid: '#3b82f6' }, // Blue
  C: { bg: '#ffedd5', text: '#9a3412', solid: '#f59e0b' }, // Orange
  D: { bg: '#fee2e2', text: '#991b1b', solid: '#ef4444' }, // Red
};

const RANK_TO_POINTS = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1
};

const STYLES = {
  card: {
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
    border: '1px solid #f3f4f6',
    backgroundColor: '#ffffff',
  },
  cardTitle: {
    color: '#6b7280',
    fontSize: '14px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  statValue: {
    fontSize: '36px',
    fontWeight: 700,
    color: '#111827',
    margin: 0,
    lineHeight: 1.2
  }
};

import axios from '../axiosConfig';

const FeedbackViewer = ({ feedback }) => {
  const [expanded, setExpanded] = useState(false);
  if (!feedback) return null;
  
  const limit = 100;
  const isLong = feedback.length > limit;
  const textToShow = expanded ? feedback : (isLong ? `${feedback.substring(0, limit)}...` : feedback);
  
  return (
    <Text style={{ color: '#4b5563', fontStyle: 'italic' }}>
      "{textToShow}"
      {isLong && (
        <Button 
          type="link" 
          size="small" 
          style={{ padding: '0 4px', fontSize: 11, height: 'auto', display: 'inline-block', fontStyle: 'normal' }} 
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Thu gọn' : 'Xem thêm'}
        </Button>
      )}
    </Text>
  );
};

const PersonalPerformance = ({ user }) => {
  const [selectedMonth, setSelectedMonth] = useState(dayjs());
  const [data, setData] = useState({
      totalPoints: 0,
      totalHours: 0,
      completionRate: 0,
      rankDistribution: { A: 0, B: 0, C: 0, D: 0 },
      weeklyTrend: [],
      recentTasks: []
  });

  React.useEffect(() => {
     if(user) {
         axios.get(`/staff/performance?userId=${user.id}&month=${selectedMonth.format('MM/YYYY')}`)
         .then(res => setData(res.data))
         .catch(err => console.error(err));
     }
  }, [user, selectedMonth]);

  const totalPoints = data.totalPoints;

  const donutData = {
    labels: ['5 Điểm (A)', '4 Điểm (B)', '3 Điểm (C)', '2 Điểm (D)'],
    datasets: [
      {
        data: [data.rankDistribution.A, data.rankDistribution.B, data.rankDistribution.C, data.rankDistribution.D],
        backgroundColor: [
          RANK_COLORS.A.solid,
          RANK_COLORS.B.solid,
          RANK_COLORS.C.solid,
          RANK_COLORS.D.solid,
        ],
        borderWidth: 0,
        cutout: '75%',
        hoverOffset: 4
      },
    ],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 24,
          usePointStyle: true,
          pointStyle: 'circle',
          font: {
            family: "'Inter', sans-serif",
            size: 13,
            weight: '500'
          },
          color: '#4b5563'
        }
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        padding: 12,
        titleFont: { family: "'Inter', sans-serif", size: 14 },
        bodyFont: { family: "'Inter', sans-serif", size: 13 },
        cornerRadius: 8,
      }
    },
  };

  const lineData = {
    labels: data.weeklyTrend.map(t => t.week),
    datasets: [
      {
        label: 'Giờ làm việc',
        data: data.weeklyTrend.map(t => t.hours),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#3b82f6',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      }
    ]
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        padding: 12,
        titleFont: { family: "'Inter', sans-serif", size: 14 },
        bodyFont: { family: "'Inter', sans-serif", size: 13 },
        cornerRadius: 8,
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: '#f3f4f6',
          drawBorder: false,
        },
        ticks: {
          font: { family: "'Inter', sans-serif", size: 12 },
          color: '#6b7280',
          stepSize: 10
        }
      },
      x: {
        grid: { display: false },
        ticks: {
          font: { family: "'Inter', sans-serif", size: 12 },
          color: '#6b7280'
        }
      }
    }
  };

  const tableColumns = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      width: '15%',
      render: (text) => <Text style={{ color: '#4b5563', fontWeight: 500 }}>{dayjs(text).format('DD/MM/YYYY')}</Text>,
    },
    {
      title: 'Tên Công Việc',
      dataIndex: 'taskName',
      key: 'taskName',
      width: '35%',
      render: (text) => <Text style={{ color: '#111827', fontWeight: 500 }}>{text}</Text>,
    },
    {
      title: 'Xếp Hạng',
      dataIndex: 'rank',
      key: 'rank',
      width: '15%',
      render: (rank) => {
        const colorCfg = RANK_COLORS[rank] || RANK_COLORS.C;
        return (
          <Tag style={{ 
            backgroundColor: colorCfg.bg, 
            color: colorCfg.text,
            border: 'none',
            borderRadius: '6px',
            padding: '4px 12px',
            fontWeight: 600,
          }}>
            {RANK_TO_POINTS[rank]} Điểm
          </Tag>
        );
      },
    },
    {
      title: 'Phản Hồi Từ Quản Lý',
      dataIndex: 'feedback',
      key: 'feedback',
      render: (text) => <FeedbackViewer feedback={text} />,
    },
  ];

  return (
    <div style={{ fontFamily: "'Inter', 'Be Vietnam Pro', sans-serif", padding: '24px', backgroundColor: '#f9fafb', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <AntTitle level={2} style={{ margin: 0, color: '#111827', fontWeight: 700, fontSize: '28px' }}>
            Báo cáo Hiệu suất & KPI
          </AntTitle>
          <Text style={{ color: '#6b7280', fontSize: '15px' }}>Xem và phân tích hiệu suất làm việc cá nhân của bạn</Text>
        </div>
        <DatePicker 
          picker="month" 
          value={selectedMonth} 
          onChange={setSelectedMonth} 
          format="MM/YYYY"
          style={{ width: '180px', height: '44px', borderRadius: '8px', fontSize: '15px', fontWeight: 500 }}
          allowClear={false}
        />
      </div>

      {/* Summary Statistics */}
      <Row gutter={[24, 24]} style={{ marginBottom: '24px' }}>
        <Col span={8}>
          <Card bordered={false} bodyStyle={{ padding: '24px' }} style={STYLES.card}>
            <div style={STYLES.cardTitle}>
              <ClockCircleOutlined style={{ color: '#3b82f6', fontSize: '16px' }} />
              Tổng giờ làm việc
            </div>
            <div style={STYLES.statValue}>
              {data.totalHours} <span style={{ fontSize: '18px', color: '#6b7280', fontWeight: 500 }}>giờ</span>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false} bodyStyle={{ padding: '24px' }} style={STYLES.card}>
            <div style={STYLES.cardTitle}>
              <TrophyOutlined style={{ color: '#f59e0b', fontSize: '16px' }} />
              Tổng điểm
            </div>
            <div style={STYLES.statValue}>
              {totalPoints} <span style={{ fontSize: '18px', color: '#6b7280', fontWeight: 500 }}>điểm</span>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false} bodyStyle={{ padding: '24px' }} style={STYLES.card}>
            <div style={STYLES.cardTitle}>
              <CheckCircleOutlined style={{ color: '#10b981', fontSize: '16px' }} />
              Tỷ lệ hoàn thành
            </div>
            <div style={STYLES.statValue}>
              {data.completionRate}<span style={{ fontSize: '24px', color: '#6b7280' }}>%</span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Main Content: Charts */}
      <Row gutter={[24, 24]} style={{ marginBottom: '24px' }}>
        {/* KPI Circle */}
        <Col span={14}>
          <Card bordered={false} style={{ ...STYLES.card, height: '420px', display: 'flex', flexDirection: 'column' }} bodyStyle={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
             <AntTitle level={4} style={{ margin: '0 0 24px 0', color: '#111827', fontWeight: 600, fontSize: '18px' }}>
              Đánh giá Năng lực (KPI)
            </AntTitle>
            <div style={{ position: 'relative', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ width: '100%', height: '100%', maxHeight: '280px', position: 'relative' }}>
                <Doughnut data={donutData} options={donutOptions} />
                <div style={{
                  position: 'absolute',
                  top: '40%', // Slightly adjusted for legend
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: 500, marginBottom: '4px' }}>Tổng Điểm KPI</div>
                  <div style={{ fontSize: '36px', color: '#3b82f6', fontWeight: 800, lineHeight: 1 }}>{totalPoints}</div>
                </div>
              </div>
            </div>
          </Card>
        </Col>
        
        {/* Progress Line */}
        <Col span={10}>
          <Card bordered={false} style={{ ...STYLES.card, height: '420px', display: 'flex', flexDirection: 'column' }} bodyStyle={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <AntTitle level={4} style={{ margin: 0, color: '#111827', fontWeight: 600, fontSize: '18px' }}>
                Xu hướng năng suất
              </AntTitle>
              <Tag color="blue" style={{ borderRadius: '6px', border: 'none', background: '#eff6ff', color: '#2563eb', fontWeight: 500 }}>
                4 tuần qua
              </Tag>
            </div>
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              <Line data={lineData} options={lineOptions} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Detailed History Table */}
      <Card bordered={false} style={STYLES.card} bodyStyle={{ padding: '24px' }}>
         <AntTitle level={4} style={{ margin: '0 0 20px 0', color: '#111827', fontWeight: 600, fontSize: '18px' }}>
          Chi tiết đánh giá gần đây
        </AntTitle>
        <Table 
          columns={tableColumns} 
          dataSource={data.recentTasks} 
          rowKey="id"
          pagination={{ pageSize: 5, position: ['bottomCenter'], showSizeChanger: false }}
          rowClassName={() => 'custom-table-row'}
          className="performance-table"
        />
        <style dangerouslySetInnerHTML={{__html: `
          .performance-table .ant-table-thead > tr > th {
            background-color: #f9fafb;
            color: #6b7280;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 0.05em;
            border-bottom: 1px solid #e5e7eb;
          }
          .performance-table .ant-table-tbody > tr > td {
            border-bottom: 1px solid #f3f4f6;
            padding: 16px;
          }
          .performance-table .ant-table-tbody > tr:last-child > td {
            border-bottom: none;
          }
          .performance-table .ant-table-tbody > tr:hover > td {
            background-color: #f8fafc;
          }
          .performance-table .ant-table-cell::before {
            display: none !important; /* Remove vertical grid lines */
          }
        `}} />
      </Card>
    </div>
  );
};

export default PersonalPerformance;
