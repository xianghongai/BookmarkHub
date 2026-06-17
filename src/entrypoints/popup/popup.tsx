import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client';
import { Dropdown, Badge, Button, Stack } from 'react-bootstrap';
import { IconContext } from 'react-icons'
import {
    AiOutlineCloudUpload, AiOutlineCloudDownload,
    AiOutlineSetting, AiOutlineGithub
} from 'react-icons/ai'
import 'bootstrap/dist/css/bootstrap.min.css';
import './popup.css'
import { Setting } from '../../utils/setting'

type DownloadResult = {
    status: 'success' | 'conflict' | 'noop' | 'error';
    localCount?: number;
    remoteCount?: number;
    message?: string;
}

function isDownloadResult(response: unknown): response is DownloadResult {
    return typeof response === 'object'
        && response != null
        && 'status' in response;
}

const Popup: React.FC = () => {
    const [count, setCount] = useState({ local: "0", remote: "0" })
    const [gistUrl, setGistUrl] = useState('https://gist.github.com/');
    const [downloadConflict, setDownloadConflict] = useState<DownloadResult | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('info');
    const [isReplacing, setIsReplacing] = useState(false);

    useEffect(() => {
        const getSetting = async () => {
            const data = await browser.storage.local.get(["localCount", "remoteCount"]);
            const setting = await Setting.build();
            setCount({
                local: String(data.localCount ?? 0),
                remote: String(data.remoteCount ?? 0),
            });
            setGistUrl(setting.gistID
                ? `https://gist.github.com/${setting.gistID}`
                : 'https://gist.github.com/'
            );
        }
        getSetting();
    }, [])

    const runAction = async (event: React.MouseEvent<HTMLButtonElement>) => {
        const button = event.currentTarget;
        button.disabled = true;
        setDownloadConflict(null);
        setStatusMessage('');
        setStatusType('info');
        try {
            const response = await browser.runtime.sendMessage({ name: button.name });
            if (button.name === 'download') {
                handleDownloadResult(response);
            }
        } catch (error) {
            console.error(error);
            setStatusType('error');
            setStatusMessage(`${browser.i18n.getMessage('error')}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    const continueDownload = async () => {
        if (isReplacing) {
            return;
        }
        setIsReplacing(true);
        setStatusMessage('');
        setStatusType('info');
        try {
            const response = await browser.runtime.sendMessage({ name: 'download', force: true });
            setDownloadConflict(null);
            handleDownloadResult(response);
        } catch (error) {
            console.error(error);
            setStatusType('error');
            setStatusMessage(`${browser.i18n.getMessage('error')}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsReplacing(false);
        }
    }

    const cancelDownload = () => {
        setDownloadConflict(null);
        setStatusMessage('');
    }

    const handleDownloadResult = (response: unknown) => {
        if (!isDownloadResult(response)) {
            return;
        }
        if (response.localCount != null || response.remoteCount != null) {
            setCount(prev => ({
                local: String(response.localCount ?? prev.local),
                remote: String(response.remoteCount ?? prev.remote),
            }));
        }
        if (response.status === 'conflict') {
            setDownloadConflict(response);
            return;
        }
        if (response.status === 'noop') {
            setStatusType('info');
            setStatusMessage(browser.i18n.getMessage('alreadySynced'));
            return;
        }
        if (response.status === 'success') {
            setStatusType('success');
            setStatusMessage(`${browser.i18n.getMessage('downloadBookmarks')}: ${browser.i18n.getMessage('success')}`);
            return;
        }
        if (response.status === 'error') {
            setStatusType('error');
            setStatusMessage(`${browser.i18n.getMessage('error')}: ${response.message ?? ''}`);
        }
    }

    return (
        <IconContext.Provider value={{ className: 'dropdown-item-icon' }}>
            <Dropdown.Menu show>
                <Dropdown.Item name='upload' as="button" onClick={runAction} title={browser.i18n.getMessage('uploadBookmarksDesc')}><AiOutlineCloudUpload />{browser.i18n.getMessage('uploadBookmarks')}</Dropdown.Item>
                <Dropdown.Item name='download' as="button" onClick={runAction} title={browser.i18n.getMessage('downloadBookmarksDesc')}><AiOutlineCloudDownload />{browser.i18n.getMessage('downloadBookmarks')}</Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item name='setting' as="button" onClick={runAction}><AiOutlineSetting />{browser.i18n.getMessage('settings')}</Dropdown.Item>
                <Dropdown.ItemText>
                    <Stack direction="horizontal" gap={3}>
                        <Badge id="localCount" bg="light" text="dark" title={browser.i18n.getMessage('localCount')}>{count["local"]}</Badge>
                        <span>/</span>
                        <Badge id="remoteCount" bg="light" text="dark" title={browser.i18n.getMessage('remoteCount')}>{count["remote"]}</Badge>
                        <a href={gistUrl} target="_blank" rel="noreferrer" title="Gist"><AiOutlineGithub /></a>
                    </Stack>
                </Dropdown.ItemText>
                {statusMessage && (
                    <Dropdown.ItemText className={`popup-status popup-status-${statusType}`}>
                        {statusMessage}
                    </Dropdown.ItemText>
                )}
                {downloadConflict && (
                    <Dropdown.ItemText className="conflict-panel">
                        <div className="conflict-title">{browser.i18n.getMessage('bookmarkConflictTitle')}</div>
                        <div>{browser.i18n.getMessage('bookmarkConflictDesc')}</div>
                        <div className="conflict-counts">
                            {browser.i18n.getMessage('localCount')}: {downloadConflict.localCount ?? 0}
                            {' / '}
                            {browser.i18n.getMessage('remoteCount')}: {downloadConflict.remoteCount ?? 0}
                        </div>
                        <div className="conflict-actions">
                            <Button type="button" size="sm" variant="outline-secondary" disabled={isReplacing} onClick={cancelDownload}>
                                {browser.i18n.getMessage('cancel')}
                            </Button>
                            <Button type="button" size="sm" variant="danger" disabled={isReplacing} onClick={continueDownload}>
                                {browser.i18n.getMessage('replaceLocalBookmarks')}
                            </Button>
                        </div>
                    </Dropdown.ItemText>
                )}
            </Dropdown.Menu >
        </IconContext.Provider>
    )
}


ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>,
);
