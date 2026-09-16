import React, { useEffect, useState } from 'react';

import { adminAPI } from '../utils/api';
import AdminPageLoading from '../components/AdminPageLoading';



export default function AdminAudit() {

  const [items, setItems] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');



  useEffect(() => {

    adminAPI

      .getAudit()

      .then((data) => setItems(data.items || []))

      .catch((err) => setError(err.message))

      .finally(() => setLoading(false));

  }, []);



  if (loading) return <AdminPageLoading message="Загрузка аудита..." />;

  if (error) return <p className="auth-error">{error}</p>;



  return (

    <>

      <div className="admin-header">

        <div>

          <h1><i className="fas fa-clipboard-list" /> Журнал аудита</h1>

          <p className="admin-subtitle">Действия администраторов</p>

        </div>

      </div>



      <div className="admin-list-wrapper">

        <table>

          <thead>

            <tr>

              <th>ID</th>

              <th>Админ</th>

              <th>Действие</th>

              <th>Цель</th>

              <th>Дата</th>

            </tr>

          </thead>

          <tbody>

            {items.map((row) => (

              <tr key={row.id}>

                <td>{row.id}</td>

                <td>{row.admin_name}</td>

                <td>{row.action}</td>

                <td>{row.target_type} #{row.target_id}</td>

                <td>{new Date(row.created_at).toLocaleString('ru-RU')}</td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </>

  );

}

