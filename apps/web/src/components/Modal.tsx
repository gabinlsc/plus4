import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import ui from '../styles/ui.module.css';
import styles from './Modal.module.css';

export function Modal({
  title,
  children,
  label,
}: {
  title: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={styles.backdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label ?? title}
        className={`${ui.panel} ${styles.dialog}`}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      >
        <h2>{title}</h2>
        {children}
      </motion.div>
    </motion.div>
  );
}
