import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2, Lock, ShieldCheck, User as UserIcon, X } from 'lucide-react';

import { api, getApiErrorMessage } from '../api';

interface ProfileModalProps {
  currentUser: string;
  isOpen: boolean;
  onClose: () => void;
  onUsernameUpdated: (nextUsername: string) => void;
  onAccountDeleted: () => void;
}

export default function ProfileModal({
  currentUser,
  isOpen,
  onClose,
  onUsernameUpdated,
  onAccountDeleted,
}: ProfileModalProps) {
  const [nextUsername, setNextUsername] = useState(currentUser);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSuccessMessage, setUsernameSuccessMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccessMessage, setPasswordSuccessMessage] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isUsernameSectionOpen, setIsUsernameSectionOpen] = useState(false);
  const [isPasswordSectionOpen, setIsPasswordSectionOpen] = useState(false);
  const [isDeleteSectionOpen, setIsDeleteSectionOpen] = useState(false);
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setNextUsername(currentUser);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setDeletePassword('');
      setUsernameError('');
      setUsernameSuccessMessage('');
      setPasswordError('');
      setPasswordSuccessMessage('');
      setDeleteError('');
      setIsUsernameSectionOpen(false);
      setIsPasswordSectionOpen(false);
      setIsDeleteSectionOpen(false);
      setIsUpdatingUsername(false);
      setIsUpdatingPassword(false);
      setIsDeletingAccount(false);
    }
  }, [currentUser, isOpen]);

  const submitUsernameChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isUpdatingUsername) return;

    setUsernameError('');
    setUsernameSuccessMessage('');

    const trimmedUsername = nextUsername.trim();
    if (!trimmedUsername) {
      setUsernameError('Username cannot be empty.');
      return;
    }

    setIsUpdatingUsername(true);
    try {
      const response = await api.post('/auth/profile/username', {
        username: trimmedUsername,
      });
      const updatedUsername = response.data.username ?? trimmedUsername;
      setUsernameSuccessMessage(
        response.data.message ?? 'Username updated successfully.',
      );
      setNextUsername(updatedUsername);
      onUsernameUpdated(updatedUsername);
    } catch (requestError) {
      setUsernameError(
        getApiErrorMessage(requestError, 'Failed to update username. Please try again.'),
      );
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  const submitPasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isUpdatingPassword) return;

    setPasswordError('');
    setPasswordSuccessMessage('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation must match.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const response = await api.post('/auth/profile/password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccessMessage(response.data.message ?? 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (requestError) {
      setPasswordError(getApiErrorMessage(requestError, 'Failed to update password. Please try again.'));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const submitAccountDeletion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isDeletingAccount) return;

    setDeleteError('');
    setIsDeletingAccount(true);
    try {
      await api.post('/auth/profile/delete', {
        current_password: deletePassword,
      });
      onAccountDeleted();
    } catch (requestError) {
      setDeleteError(
        getApiErrorMessage(requestError, 'Failed to delete account. Please try again.'),
      );
      setIsDeletingAccount(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-lg rounded-3xl border border-white/70 bg-white/90 shadow-2xl shadow-indigo-900/10 backdrop-blur-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-6 py-5">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
                  <ShieldCheck className="h-4 w-4" />
                  Account Settings
                </div>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">Security</h2>
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                  <UserIcon className="h-4 w-4 text-slate-400" />
                  Signed in as <span className="font-semibold text-slate-700">{currentUser}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                aria-label="Close account settings"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-6">
              <div className="rounded-3xl border border-sky-100 bg-sky-50/70 p-5">
                {!isUsernameSectionOpen ? (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-sm">
                        <UserIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Change username</h3>
                        <p className="text-sm text-slate-500">
                          Rename your account and keep saved data.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUsernameError('');
                        setUsernameSuccessMessage('');
                        setNextUsername(currentUser);
                        setIsUsernameSectionOpen(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-300 bg-white px-5 py-3 text-sm font-semibold text-sky-700 transition hover:border-sky-400 hover:bg-sky-50"
                    >
                      <UserIcon className="h-4 w-4" />
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-sm">
                          <UserIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">Change username</h3>
                          <p className="text-sm text-slate-500">
                            Keep your saved chat and study data while renaming the account.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsUsernameSectionOpen(false);
                          setNextUsername(currentUser);
                          setUsernameError('');
                          setUsernameSuccessMessage('');
                        }}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                      >
                        Cancel
                      </button>
                    </div>

                    <form onSubmit={submitUsernameChange} className="mt-5 space-y-4">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">New username</span>
                        <input
                          type="text"
                          value={nextUsername}
                          onChange={(event) => setNextUsername(event.target.value)}
                          minLength={3}
                          maxLength={50}
                          required
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                          placeholder="Choose a new username"
                        />
                      </label>

                      {usernameError && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {usernameError}
                        </div>
                      )}

                      {usernameSuccessMessage && (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                          {usernameSuccessMessage}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3 pt-2">
                        <p className="text-xs text-slate-500">
                          Your active session will be refreshed automatically after the rename.
                        </p>
                        <button
                          type="submit"
                          disabled={isUpdatingUsername}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {isUpdatingUsername ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserIcon className="h-4 w-4" />}
                          Update username
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>

              <div className="mt-5 rounded-3xl border border-indigo-100 bg-indigo-50/70 p-5">
                {!isPasswordSectionOpen ? (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                        <Lock className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Change password</h3>
                        <p className="text-sm text-slate-500">
                          Update your password without logging out.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordError('');
                        setPasswordSuccessMessage('');
                        setIsPasswordSectionOpen(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-indigo-300 bg-white px-5 py-3 text-sm font-semibold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
                    >
                      <Lock className="h-4 w-4" />
                      Update
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                          <Lock className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">Change password</h3>
                          <p className="text-sm text-slate-500">
                            Update your password without logging out of the current session.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsPasswordSectionOpen(false);
                          setCurrentPassword('');
                          setNewPassword('');
                          setConfirmPassword('');
                          setPasswordError('');
                          setPasswordSuccessMessage('');
                        }}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                      >
                        Cancel
                      </button>
                    </div>

                    <form onSubmit={submitPasswordChange} className="mt-5 space-y-4">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">Current password</span>
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={(event) => setCurrentPassword(event.target.value)}
                          minLength={1}
                          required
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                          placeholder="Enter your current password"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">New password</span>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          minLength={6}
                          required
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                          placeholder="Choose a new password"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">Confirm new password</span>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          minLength={6}
                          required
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                          placeholder="Re-enter the new password"
                        />
                      </label>

                      {passwordError && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {passwordError}
                        </div>
                      )}

                      {passwordSuccessMessage && (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                          {passwordSuccessMessage}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3 pt-2">
                        <p className="text-xs text-slate-500">
                          Your password update keeps the current session active.
                        </p>
                        <button
                          type="submit"
                          disabled={isUpdatingPassword}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {isUpdatingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                          Update password
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>

              <div className="mt-5 rounded-3xl border border-red-200 bg-red-50/80 p-5">
                {!isDeleteSectionOpen ? (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-red-600 shadow-sm">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Delete account</h3>
                        <p className="text-sm text-slate-500">
                          Permanently remove this account.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError('');
                        setDeletePassword('');
                        setIsDeleteSectionOpen(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-300 bg-white px-5 py-3 text-sm font-semibold text-red-600 transition hover:border-red-400 hover:bg-red-50"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-red-600 shadow-sm">
                            <AlertTriangle className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">Delete account - are you sure?</h3>
                            <p className="text-sm text-slate-500">
                              This permanently removes your login and saved video history.
                            </p>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDeleteSectionOpen(false);
                          setDeletePassword('');
                          setDeleteError('');
                        }}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                      >
                        Cancel
                      </button>
                    </div>

                    <ul className="mt-5 space-y-2 rounded-2xl border border-red-200 bg-white/70 p-4 text-sm text-red-800">
                      <li>Deleting your account is permanent and cannot be undone.</li>
                      <li>Your saved video history will be removed from this account.</li>
                      <li>Your locally saved chat and study state for this account will be cleared on this device.</li>
                    </ul>

                    <form onSubmit={submitAccountDeletion} className="mt-5 space-y-4">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">Current password</span>
                        <input
                          type="password"
                          value={deletePassword}
                          onChange={(event) => setDeletePassword(event.target.value)}
                          minLength={1}
                          required
                          className="w-full rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-500/20"
                          placeholder="Enter your current password to confirm"
                        />
                      </label>

                      {deleteError && (
                        <div className="rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm text-red-700">
                          {deleteError}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3 pt-2">
                        <p className="text-xs text-red-700/80">
                          We will return you to the sign-in screen after deletion.
                        </p>
                        <button
                          type="submit"
                          disabled={isDeletingAccount}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/25 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {isDeletingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                          Delete account
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
