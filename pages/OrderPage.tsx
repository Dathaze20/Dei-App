import React, { useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import { useLocation, useNavigate } from 'react-router-dom';
import useInventory from '../hooks/useInventory';
import { PlusIcon, MinusIcon, TrashIcon, ShareIcon, XIcon, ShoppingCartIcon, HomeIcon, EnvelopeIcon, ClipboardListIcon, CheckCircleIcon, AlertTriangleIcon } from '../components/shared/icons';
import SupplierChip from '../components/SupplierChip';
import { buildOrderSummary, buildOrderText } from '../utils/orderSummary';
import AnimatedPage from '../components/AnimatedPage';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import Modal from '../components/Modal';
import OverlayPortal from '../components/OverlayPortal';
import ProductThumb from '../components/ProductThumb';

const itemVariants = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 50, transition: { duration: 0.2 } },
};

const OrderPage: React.FC = () => {
  const { currentOrder, getProductById, getSupplierById, updateOrderItemQuantity, removeFromOrder, convertOrderLineToItems, deliName, clearOrder, getWorkflow } = useInventory();
  const { t } = useTranslation();
  const location = useLocation(); // the empty-order button goes back to Counter or Classic, whichever is open
  const navigate = useNavigate();
  const [isShareModalOpen, setShareModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isClearConfirmOpen, setClearConfirmOpen] = useState(false);


  // One summary drives the page and the shared text (QR code, Copy Text, Send as Text).
  const summary = useMemo(
    () => buildOrderSummary(currentOrder.items, getProductById, getSupplierById, getWorkflow),
    [currentOrder.items, getProductById, getSupplierById, getWorkflow],
  );

  const orderTextForSharing = useMemo(() => buildOrderText(summary, deliName, new Date(), t), [summary, deliName, t]);

  const handleConvert = (productId: string, quantity: number) => {
    if (window.confirm(t('convertToItemsConfirm', { quantity }))) convertOrderLineToItems(productId);
  };
  
  const handleCloseShareModal = () => {
    setShareModalOpen(false);
    setIsCopied(false);
  }
  
  if (currentOrder.items.length === 0) {
    return (
      <AnimatedPage>
        <div className="text-center py-16 bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5">
          <ShoppingCartIcon className="mx-auto h-12 w-12 text-slate-400" />
          <h2 className="mt-4 text-2xl font-bold text-slate-800 dark:text-white">{t('orderEmptyTitle')}</h2>
          <p className="text-brand-muted mt-2 max-w-md mx-auto">{t('orderEmptyMessage')}</p>
          <div className="mt-6">
              <motion.button
                  onClick={() => navigate(location.pathname.startsWith('/counter') ? '/counter' : '/')}
                  className="bg-brand-primary hover:bg-brand-primary-hover text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center gap-2 mx-auto"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
              >
                  <HomeIcon className="h-5 w-5" />
                  <span>{t('browseProducts')}</span>
              </motion.button>
          </div>
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
      <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5 p-3 sm:p-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-4">{t('currentOrderTitle')}</h1>
        <div className="space-y-4">
          <AnimatePresence>
            {summary.groups.map(group => (
              <motion.div 
                key={group.supplier.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="border border-slate-200/80 dark:border-slate-800/80 rounded-lg overflow-hidden"
              >
                <div className="flex justify-between items-center gap-2 bg-slate-100/70 dark:bg-slate-800/70 px-3 py-2">
                    <div className="min-w-0"><SupplierChip supplier={group.supplier} /></div>
                    <span className="flex-shrink-0 font-bold text-slate-700 dark:text-slate-200">
                      {group.subtotal !== null ? `$${group.subtotal.toFixed(2)}` : t('notPriced')}
                    </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 p-1">
                    <AnimatePresence>
                      {group.lines.map(line => {
                      const { item, product, unit } = line;
                      return (
                      <motion.div 
                        key={`${item.productId}|${unit}`} 
                        className="flex flex-wrap items-start gap-x-3 gap-y-1 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/50"
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        layout
                        data-testid="order-line"
                      >
                          <ProductThumb product={product} alt={product.name} className="w-12 h-12 rounded-md" />
                          {/* Two lines on phones: what it is, then quantity · line total · remove. */}
                          <div className="min-w-0 flex-1 basis-40">
                            <h3 dir="auto" className="rtl:text-right break-words font-bold text-[0.9375rem] leading-snug text-slate-800 dark:text-slate-100">{product.name} <span className="text-brand-muted font-normal">({product.flavor})</span></h3>
                            {line.priced ? (
                              <p className="text-sm text-slate-500">{item.quantity} x ${product.costPrice.toFixed(2)}/case</p>
                            ) : line.olderCaseLine ? (
                              <div className="text-sm text-amber-700 dark:text-amber-300">
                                <p className="font-semibold">{item.quantity} {t('casesUnit')} · {t('olderCaseLine')}</p>
                                <p className="text-xs">{t('olderCaseLineHelp', { quantity: item.quantity })}</p>
                                <button type="button" onClick={() => handleConvert(item.productId, item.quantity)} className="mt-1 min-h-[44px] px-3 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold">
                                  {t('convertToItems')}
                                </button>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-500">{t('itemsQuantity', { quantity: item.quantity })}</p>
                            )}
                          </div>
                          <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
                            <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-600" dir="ltr">
                              <motion.button whileTap={{scale: 0.9}} onClick={() => updateOrderItemQuantity(item.productId, item.quantity - 1, unit)} className="inline-flex h-11 w-11 items-center justify-center rounded-l-xl hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={t('decreaseQuantity')}><MinusIcon className="h-5 w-5"/></motion.button>
                              <span className="min-w-8 text-center text-lg font-bold">{item.quantity}</span>
                              <motion.button whileTap={{scale: 0.9}} onClick={() => updateOrderItemQuantity(item.productId, item.quantity + 1, unit)} className="inline-flex h-11 w-11 items-center justify-center rounded-r-xl hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={t('increaseQuantity')}><PlusIcon className="h-5 w-5"/></motion.button>
                            </div>
                            <div className="ms-auto flex items-center gap-1">
                              {line.lineTotal !== null && <p className="font-bold">${line.lineTotal.toFixed(2)}</p>}
                              <motion.button whileTap={{scale: 0.9}} onClick={() => removeFromOrder(item.productId, unit)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/50 transition-colors" aria-label={t('removeFromOrder')}><TrashIcon className="h-5 w-5"/></motion.button>
                            </div>
                          </div>
                      </motion.div>
                      );
                      })}
                    </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div data-testid="order-total">
            {(summary.hasPriced || !summary.hasUnpriced) && (
              <div className="text-2xl font-bold">
                <span className="text-slate-500 dark:text-slate-400">{summary.hasUnpriced ? t('pricedSubtotal') : t('total')} </span>
                <span className="text-slate-900 dark:text-white">${summary.pricedTotal.toFixed(2)}</span>
              </div>
            )}
            {summary.hasUnpriced && <p className="text-sm text-brand-muted">{t('unpricedNote')}</p>}
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
               <motion.button
                  onClick={() => setClearConfirmOpen(true)}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-5 rounded-lg transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
              >
                  <TrashIcon className="h-5 w-5"/>
                  <span>{t('clearOrder')}</span>
              </motion.button>
              <motion.button
                  onClick={() => setShareModalOpen(true)}
                  className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white font-bold py-3 px-5 rounded-lg transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
              >
                  <ShareIcon className="h-5 w-5"/>
                  <span>{t('share')}</span>
              </motion.button>
          </div>
        </div>
        <OverlayPortal>
        <AnimatePresence>
        {isShareModalOpen && (
            <motion.div 
              className="fixed inset-0 bg-black/50 backdrop-blur-lg z-50 flex justify-center items-center px-[calc(0.75rem+var(--safe-left))] pt-[calc(0.75rem+var(--safe-top))] pb-[calc(0.75rem+var(--safe-bottom))]" onClick={handleCloseShareModal}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
                <motion.div 
                  className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-full overflow-y-auto overscroll-contain p-4 sm:p-6 ring-1 ring-black/5 dark:ring-white/10" 
                  onClick={(e) => e.stopPropagation()}
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                >
                    {/* Stays at the top while the dialog content scrolls, so Close is always reachable. */}
                    <div className="sticky -top-4 sm:-top-6 z-10 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 mb-3 px-4 sm:px-6 pt-2 pb-2 flex justify-between items-center gap-2 bg-slate-100 dark:bg-slate-900">
                        <h2 className="min-w-0 truncate text-xl font-bold text-slate-900 dark:text-white">{t('share')} {t('order')}</h2>
                        <motion.button onClick={handleCloseShareModal} aria-label={t('closeDialog')} className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800" whileTap={{scale: 0.9}}><XIcon className="h-6 w-6" /></motion.button>
                    </div>
                    <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Scan the QR code, or share the order details via text message or by copying.</p>
                    <div className="flex justify-center p-4 bg-slate-200/70 dark:bg-slate-800/70 rounded-lg">
                        <div className="bg-white p-2 rounded-md shadow-inner">
                            <QRCode value={orderTextForSharing} size={200} title="Deli Order Details"/>
                        </div>
                    </div>
                    <div className="mt-4">
                        <textarea
                            readOnly
                            value={orderTextForSharing}
                            className="w-full h-36 p-3 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800/50 focus:outline-none font-mono text-xs"
                        />
                    </div>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <motion.button
                          onClick={() => {
                              navigator.clipboard.writeText(orderTextForSharing);
                              setIsCopied(true);
                              setTimeout(() => setIsCopied(false), 2000);
                          }}
                          disabled={isCopied}
                          className="flex items-center justify-center gap-2 w-full bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-70"
                          whileTap={{ scale: 0.95 }}
                      >
                          {isCopied ? (
                              <>
                                  <CheckCircleIcon className="h-5 w-5 text-green-500"/>
                                  <span>{t('copied')}</span>
                              </>
                          ) : (
                              <>
                                  <ClipboardListIcon className="h-5 w-5"/>
                                  <span>{t('copyText')}</span>
                              </>
                          )}
                      </motion.button>
                      <motion.a
                          href={`sms:?&body=${encodeURIComponent(orderTextForSharing)}`}
                          className="flex items-center justify-center gap-2 w-full bg-brand-primary hover:bg-brand-primary-hover text-white font-bold py-3 px-4 rounded-lg transition-colors"
                          whileTap={{ scale: 0.95 }}
                      >
                          <EnvelopeIcon className="h-5 w-5" />
                          <span>{t('sendAsText')}</span>
                      </motion.a>
                  </div>
                </motion.div>
            </motion.div>
        )}
        </AnimatePresence>
        </OverlayPortal>
        <Modal isOpen={isClearConfirmOpen} onClose={() => setClearConfirmOpen(false)} title={t('clearOrderConfirmationTitle')}>
            <div className="text-center p-4">
                <AlertTriangleIcon className="mx-auto h-12 w-12 text-red-500" />
                <p className="mt-4 text-slate-600 dark:text-slate-300">{t('clearOrderConfirmationMessage')}</p>
                <div className="mt-6 flex justify-center gap-4">
                    <motion.button
                        onClick={() => setClearConfirmOpen(false)}
                        className="py-2 px-6 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 font-semibold active:scale-98"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        {t('cancel')}
                    </motion.button>
                    <motion.button
                        onClick={() => {
                            clearOrder();
                            setClearConfirmOpen(false);
                        }}
                        className="py-2 px-6 rounded-lg bg-red-600 text-white hover:bg-red-700 font-semibold active:scale-98"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        {t('confirmClear')}
                    </motion.button>
                </div>
            </div>
        </Modal>
      </div>
    </AnimatedPage>
  );
};

export default OrderPage;