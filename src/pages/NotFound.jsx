import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState } from '../components/ui.jsx';

export default function NotFound() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <div className="notfound">
      <EmptyState
        emoji="🧭"
        title="Страница не найдена"
        description={`Адрес ${location.pathname} не существует. Возможно, ссылка устарела или в адресе опечатка.`}
        action={
          <Link to={user ? '/app' : '/'} className="btn btn-primary" style={{ marginTop: 14 }}>
            {user ? 'На главную панели' : 'На главную страницу'}
          </Link>
        }
      />
    </div>
  );
}