import { Component } from 'react';

/**
 * Граница ошибок: вместо белого экрана показывает понятное сообщение и кнопки
 * «Повторить» / «Обновить страницу». Сбрасывает состояние при смене маршрута.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[ui] Ошибка в компоненте:', error, info);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset() {
    this.setState({ error: null, info: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash">
        <div className="card card-pad">
          <div className="crash-icon" aria-hidden="true">⚠️</div>
          <h3>Страница не смогла отобразиться</h3>
          <p className="sub">
            Произошла ошибка при отрисовке интерфейса. Данные не потеряны — попробуйте повторить попытку.
          </p>
          <pre className="crash-log">{String(error.message || error)}</pre>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <button type="button" className="btn btn-primary" onClick={this.reset}>Повторить</button>
            <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
              Обновить страницу
            </button>
          </div>
        </div>
      </div>
    );
  }
}