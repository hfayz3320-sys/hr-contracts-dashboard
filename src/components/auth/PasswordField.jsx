import React, { useState } from 'react';

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  autoComplete = 'current-password',
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`password-field ${error ? 'has-error' : ''}`}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}
