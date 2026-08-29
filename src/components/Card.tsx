import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import './Card.css';

type CardVariant = 'default' | 'accent' | 'hero' | 'bordered' | 'flat';

interface CardProps extends HTMLMotionProps<'div'> {
  variant?: CardVariant;
  hover?: boolean;
  noPadding?: boolean;
}

const Card: React.FC<CardProps> = ({
  variant = 'default',
  hover = false,
  noPadding = false,
  className = '',
  children,
  ...rest
}) => {
  const classes = [
    'shared-card',
    `shared-card--${variant}`,
    hover && 'shared-card--hover',
    noPadding && 'shared-card--no-padding',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.div className={classes} {...rest}>
      {children}
    </motion.div>
  );
};

export default Card;
