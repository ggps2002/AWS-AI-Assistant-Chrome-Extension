import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_BACKEND_URL, getSettings } from '../../shared/config';
import { setItem } from '../../shared/storage';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [backendUrl, setBackendUrl] = useState('');
  const [state, setState] = useState<'idle' | 'saved' | 'invalid'>('idle');

  useEffect(() => {
    getSettings().then((settings) => setBackendUrl(settings.backendUrl));
  }, []);

  const save = async (url: string) => {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/\S+$/i.test(trimmed)) {
      setState('invalid');
      return;
    }
    await setItem('settings', { backendUrl: trimmed });
    setBackendUrl(trimmed);
    setState('saved');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void save(backendUrl);
  };

  return (
    <form className="settings" onSubmit={onSubmit}>
      <label className="settings__label" htmlFor="backend-url">
        Assistant backend URL
      </label>
      <input
        id="backend-url"
        className="settings__input"
        type="url"
        value={backendUrl}
        spellCheck={false}
        onChange={(event) => {
          setBackendUrl(event.target.value);
          setState('idle');
        }}
      />
      <p className="settings__hint">Your own Hugging Face Space, or http://localhost:7860 while developing the backend.</p>
      {state === 'invalid' && (
        <p className="settings__error" role="alert">
          Enter a full URL that starts with http:// or https://.
        </p>
      )}
      <div className="settings__actions">
        <button type="submit" className="button button--primary">
          Save
        </button>
        <button type="button" className="button button--secondary" onClick={() => void save(DEFAULT_BACKEND_URL)}>
          Use default
        </button>
        {state === 'saved' && (
          <span className="settings__saved" role="status">
            Saved
          </span>
        )}
        <button type="button" className="text-button settings__close" onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  );
}
