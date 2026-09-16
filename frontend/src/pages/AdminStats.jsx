import React, { useEffect, useState } from 'react';

import { adminAPI } from '../utils/api';
import AdminPageLoading from '../components/AdminPageLoading';



export default function AdminStats() {

  const [stats, setStats] = useState(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');



  useEffect(() => {

    adminAPI

      .getStats()

      .then(setStats)

      .catch((err) => setError(err.message))

      .finally(() => setLoading(false));

  }, []);



  if (loading) return <AdminPageLoading message="Загрузка статистики..." />;

  if (error) return <p className="auth-error">{error}</p>;

  if (!stats) return null;



  return (

    <>

      <div className="admin-header">

        <div>

          <h1><i className="fas fa-chart-bar" /> Статистика</h1>

          <p className="admin-subtitle">Общие показатели платформы</p>

        </div>

      </div>



      <div className="admin-stats">

        <div className="stat-card">

          <div className="stat-icon users"><i className="fas fa-users" /></div>

          <div className="stat-info">

            <span className="stat-number">{stats.total_users}</span>

            <span className="stat-label">Всего пользователей</span>

          </div>

        </div>

        <div className="stat-card">

          <div className="stat-icon blocked"><i className="fas fa-user-lock" /></div>

          <div className="stat-info">

            <span className="stat-number">{stats.banned_users}</span>

            <span className="stat-label">Заблокировано</span>

          </div>

        </div>

        <div className="stat-card">

          <div className="stat-icon active"><i className="fas fa-user-check" /></div>

          <div className="stat-info">

            <span className="stat-number">{stats.online_users}</span>

            <span className="stat-label">Онлайн</span>

          </div>

        </div>

      </div>



      <div className="admin-list-wrapper">

        <table>

          <thead>

            <tr>

              <th>Роль</th>

              <th>Количество</th>

            </tr>

          </thead>

          <tbody>

            {Object.entries(stats.users_by_role || {}).map(([role, count]) => (

              <tr key={role}>

                <td>{role}</td>

                <td>{count}</td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </>

  );

}

