import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client';
import { Container, Form, Button, Col, Row, InputGroup, ListGroup, Stack, Badge } from 'react-bootstrap';
import { useForm } from "react-hook-form";
import 'bootstrap/dist/css/bootstrap.min.css';
import './options.css'
import optionsStorage from '../../utils/optionsStorage'
import BookmarkService, { GistRevisionRecord } from '../../utils/services'

type OptionsFormValues = {
    githubToken: string;
    gistID: string;
    enableNotify: boolean;
}

type ConnectionStatus = 'idle' | 'creating' | 'testing' | 'success' | 'failed';
type HistoryStatus = 'idle' | 'loading' | 'loaded' | 'failed';

const getFormValues = () => {
    const form = document.getElementById('formOptions') as HTMLFormElement;
    const formData = new FormData(form);
    return {
        form,
        githubToken: String(formData.get('githubToken') ?? '').trim(),
        gistID: String(formData.get('gistID') ?? '').trim(),
    }
}

const Popup: React.FC = () => {
    const { register } = useForm<OptionsFormValues>();
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
    const [connectionMessage, setConnectionMessage] = useState('');
    const [hasGistID, setHasGistID] = useState(false);
    const [historyStatus, setHistoryStatus] = useState<HistoryStatus>('idle');
    const [historyMessage, setHistoryMessage] = useState('');
    const [historyItems, setHistoryItems] = useState<GistRevisionRecord[]>([]);
    const [restoreId, setRestoreId] = useState('');

    useEffect(() => {
        optionsStorage.syncForm('#formOptions').then(() => {
            const { gistID } = getFormValues();
            setHasGistID(Boolean(gistID));
            if (gistID) {
                loadHistory();
            }
        });

        return () => optionsStorage.stopSyncForm();
    }, [])

    const resetConnectionStatus = () => {
        setConnectionStatus('idle');
        setConnectionMessage('');
    }

    const createPrivateGist = async () => {
        const { form, githubToken, gistID } = getFormValues();
        if (!githubToken) {
            setConnectionStatus('failed');
            setConnectionMessage(`${browser.i18n.getMessage('createPrivateGist')}: ${browser.i18n.getMessage('error')} - ${browser.i18n.getMessage('githubToken')}`);
            return;
        }
        if (gistID) {
            setConnectionStatus('failed');
            setConnectionMessage(browser.i18n.getMessage('gistIdAlreadySet'));
            return;
        }

        setConnectionStatus('creating');
        setConnectionMessage('');
        try {
            await optionsStorage.set({ githubToken });
            const gist = await BookmarkService.createPrivateGist();
            if (gist.public !== false) {
                throw new Error(browser.i18n.getMessage('gistMustBePrivate'));
            }
            if (!gist.id) {
                throw new Error('GitHub did not return a Gist ID');
            }

            const gistInput = form.elements.namedItem('gistID') as HTMLInputElement;
            gistInput.value = gist.id;
            await optionsStorage.set({ gistID: gist.id });
            setHasGistID(true);
            await BookmarkService.testConnection();
            setConnectionStatus('success');
            setConnectionMessage(`${browser.i18n.getMessage('createPrivateGist')}: ${browser.i18n.getMessage('success')}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setConnectionStatus('failed');
            setConnectionMessage(`${browser.i18n.getMessage('createPrivateGist')}: ${browser.i18n.getMessage('failed')} - ${message}`);
        }
    }

    const testConnection = async () => {
        const { githubToken, gistID } = getFormValues();
        if (!githubToken || !gistID) {
            setConnectionStatus('failed');
            setConnectionMessage(`${browser.i18n.getMessage('testConnection')}: ${browser.i18n.getMessage('error')} - ${browser.i18n.getMessage('githubToken')} / ${browser.i18n.getMessage('gistID')}`);
            return;
        }

        setConnectionStatus('testing');
        setConnectionMessage('');
        try {
            await optionsStorage.set({
                githubToken,
                gistID,
            });
            await BookmarkService.testConnection();
            setConnectionStatus('success');
            setConnectionMessage(`${browser.i18n.getMessage('testConnection')}: ${browser.i18n.getMessage('success')}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setConnectionStatus('failed');
            setConnectionMessage(`${browser.i18n.getMessage('testConnection')}: ${browser.i18n.getMessage('failed')} - ${message}`);
        }
    }

    const loadHistory = async () => {
        const { githubToken, gistID } = getFormValues();
        if (!githubToken || !gistID) {
            setHistoryStatus('failed');
            setHistoryMessage('History requires GitHub Token and Gist ID');
            return;
        }
        setHistoryStatus('loading');
        setHistoryMessage('');
        try {
            await optionsStorage.set({ githubToken, gistID });
            const gist = await BookmarkService.getCurrentGist();
            setHistoryItems(BookmarkService.normalizeHistory(gist.history ?? []));
            setHistoryStatus('loaded');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setHistoryStatus('failed');
            setHistoryMessage(`History load failed - ${message}`);
        }
    }

    const restoreHistoryItem = async (item: GistRevisionRecord) => {
        if (!item.revisionId) {
            return;
        }
        setRestoreId(item.revisionId);
        setHistoryStatus('loading');
        setHistoryMessage('Restoring...');
        try {
            const response = await browser.runtime.sendMessage({ name: 'restore', revisionId: item.revisionId });
            if (response?.status === 'success') {
                setHistoryMessage('Restored to local bookmarks');
            } else if (response?.status === 'error') {
                setHistoryMessage(`Restore failed - ${response.message ?? ''}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setHistoryMessage(`Restore failed - ${message}`);
        } finally {
            setRestoreId('');
            setHistoryStatus('loaded');
        }
    }

    return (
        <Container>
            <Form id='formOptions' name='formOptions'>
                <Form.Group as={Row} className="mt-2">
                    <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('githubToken')}</Form.Label>
                    <Col sm={9} lg={10} xs={9}>
                        <InputGroup size="sm">
                            <Form.Control
                                {...register('githubToken', {
                                    onChange: resetConnectionStatus,
                                })}
                                type="text"
                                placeholder="github token"
                                size="sm"
                                required
                            />
                            <Button
                                variant="outline-secondary"
                                as="a"
                                target="_blank"
                                href="https://github.com/settings/personal-access-tokens/new?name=BookmarkHub--&description=BookmarkHub--%20bookmark%20sync&gists=write"
                                size="sm"
                            >
                                Get Token
                            </Button>
                        </InputGroup>
                    </Col>
                </Form.Group>

                <Form.Group as={Row} className="mt-2">
                    <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('gistID')}</Form.Label>
                    <Col sm={9} lg={10} xs={9}>
                        <InputGroup size="sm">
                            <Form.Control
                                {...register('gistID', {
                                    onChange: event => {
                                        setHasGistID(Boolean(event.target.value.trim()));
                                        resetConnectionStatus();
                                    },
                                })}
                                type="text"
                                placeholder="gist ID"
                                size="sm"
                                required
                            />
                            <Button
                                type="button"
                                variant="outline-secondary"
                                size="sm"
                                disabled={hasGistID || connectionStatus === 'creating' || connectionStatus === 'testing'}
                                onClick={createPrivateGist}
                            >
                                {browser.i18n.getMessage('createPrivateGist')}{connectionStatus === 'creating' ? '...' : ''}
                            </Button>
                            <Button
                                type="button"
                                variant="outline-secondary"
                                size="sm"
                                disabled={connectionStatus === 'creating' || connectionStatus === 'testing'}
                                onClick={testConnection}
                            >
                                {browser.i18n.getMessage('testConnection')}{connectionStatus === 'testing' ? '...' : ''}
                            </Button>
                        </InputGroup>
                        {connectionStatus !== 'idle' && connectionStatus !== 'creating' && connectionStatus !== 'testing' && (
                            <Form.Text
                                aria-live="polite"
                                className={connectionStatus === 'success' ? 'text-success' : 'text-danger'}
                            >
                                {connectionMessage}
                            </Form.Text>
                        )}
                    </Col>
                </Form.Group>
                <Form.Group as={Row} className="mt-2">
                    <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('enableNotifications')}</Form.Label>
                    <Col sm={9} lg={10} xs={9}>
                        <Form.Check
                            id="enableNotify"
                            {...register('enableNotify')}
                            type="switch"
                        />
                    </Col>
                </Form.Group>
                <Form.Group as={Row} className="mt-3">
                    <Form.Label column="sm" sm={3} lg={2} xs={3}>History</Form.Label>
                    <Col sm={9} lg={10} xs={9}>
                        <Stack direction="horizontal" gap={2} className="mb-2">
                            <Button
                                type="button"
                                variant="outline-secondary"
                                size="sm"
                                disabled={historyStatus === 'loading' || !hasGistID}
                                onClick={loadHistory}
                            >
                                Refresh
                            </Button>
                        </Stack>
                        {historyMessage && (
                            <Form.Text aria-live="polite" className={historyStatus === 'failed' ? 'text-danger' : 'text-muted'}>
                                {historyMessage}
                            </Form.Text>
                        )}
                        <ListGroup variant="flush" className="history-list">
                            {historyItems.map(item => {
                                const key = item.revisionId || item.committedAt || Math.random().toString();
                                const committedAt = new Date(item.committedAt).toLocaleString();

                                return (
                                    <ListGroup.Item key={key} className="px-0 py-2">
                                        <Stack direction="horizontal" gap={2} className="justify-content-between align-items-start">
                                            <Stack className="history-meta" direction="horizontal" gap={2}>
                                                <div className="history-version"><Badge bg="primary">{item.revisionId.slice(0, 12) || 'Unknown revision'}</Badge></div>
                                                <div className="history-time">{(committedAt) || 'Unknown time'}</div>
                                            </Stack>
                                            <Button
                                                type="button"
                                                variant="outline-primary"
                                                size="sm"
                                                disabled={historyStatus === 'loading' || restoreId === item.revisionId}
                                                onClick={() => restoreHistoryItem(item)}
                                            >
                                                Restore
                                            </Button>
                                        </Stack>
                                    </ListGroup.Item>
                                )
                            })}
                        </ListGroup>
                    </Col>
                </Form.Group>
            </Form>
        </Container >
    )
}


ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>,
  );
