import React from 'react';
import { IonIcon } from '@ionic/react';
import { eyeOutline, eyeOffOutline } from 'ionicons/icons';
import { useAmountVisibility } from '../store/amountVisibilityStore';
import './AmountDisplay.css';

interface AmountDisplayProps {
  value: number;
  currency?: string;
  className?: string;
  showToggle?: boolean;
}

const AmountDisplay: React.FC<AmountDisplayProps> = ({
  value,
  currency = 'GH₵',
  className = '',
  showToggle = true,
}) => {
  const { hidden, toggle } = useAmountVisibility();
  const formatted = Number(value ?? 0).toFixed(2);

  return (
    <span className={`amount-display ${className}`}>
      <span className="amount-display-value">
        {currency} {hidden ? '••••••' : formatted}
      </span>
      {showToggle && (
        <button
          className="amount-display-toggle"
          onClick={toggle}
          aria-label={hidden ? 'Show balance' : 'Hide balance'}
          type="button"
        >
          <IonIcon icon={hidden ? eyeOffOutline : eyeOutline} />
        </button>
      )}
    </span>
  );
};

export default AmountDisplay;
