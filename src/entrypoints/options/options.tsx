import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client';
import { Container, Form, Button, Col, Row, InputGroup } from 'react-bootstrap';
import { useForm } from "react-hook-form";
import 'bootstrap/dist/css/bootstrap.min.css';
import './options.css'
import optionsStorage from '../../utils/optionsStorage'
import BookmarkService from '../../utils/services'

type OptionsFormValues = {
    githubToken: string;
    gistID: string;
    enableNotify: boolean;
}

type ConnectionStatus = 'idle' | 'creating' | 'testing' | 'success' | 'failed';

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

    useEffect(() => {
        optionsStorage.syncForm('#formOptions').then(() => {
            const { gistID } = getFormValues();
            setHasGistID(Boolean(gistID));
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

    return (
        <Container>
            <Form id='formOptions' name='formOptions'>
                <Form.Group as={Row}>
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

                <Form.Group as={Row}>
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
                <Form.Group as={Row}>
                    <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('enableNotifications')}</Form.Label>
                    <Col sm={9} lg={10} xs={9}>
                        <Form.Check
                            id="enableNotify"
                            {...register('enableNotify')}
                            type="switch"
                        />
                    </Col>
                </Form.Group>
                <Form.Group as={Row}>
                    <Form.Label column="sm" sm={3} lg={2} xs={3}></Form.Label>
                    <Col sm={9} lg={10} xs={9}>
                        <a href="https://github.com/dudor/BookmarkHub" target="_blank">{browser.i18n.getMessage('help')}</a>
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
