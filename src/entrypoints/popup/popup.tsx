import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client';
import { Dropdown, Badge } from 'react-bootstrap';
import { IconContext } from 'react-icons'
import {
    AiOutlineCloudUpload, AiOutlineCloudDownload,
    AiOutlineSetting, AiOutlineGithub
} from 'react-icons/ai'
import 'bootstrap/dist/css/bootstrap.min.css';
import './popup.css'

const Popup: React.FC = () => {
    const [count, setCount] = useState({ local: "0", remote: "0" })

    useEffect(() => {
        const getSetting = async () => {
            const data = await browser.storage.local.get(["localCount", "remoteCount"]);
            setCount({
                local: String(data.localCount ?? 0),
                remote: String(data.remoteCount ?? 0),
            });
        }
        getSetting();
    }, [])

    const runAction = async (event: React.MouseEvent<HTMLButtonElement>) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            await browser.runtime.sendMessage({ name: button.name });
        } catch (error) {
            console.error(error);
        } finally {
            button.disabled = false;
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
                    <Badge id="localCount" bg="light" title={browser.i18n.getMessage('localCount')}>{count["local"]}</Badge>/<Badge id="remoteCount" bg="light" title={browser.i18n.getMessage('remoteCount')}>{count["remote"]}</Badge>|
                    <a href="https://github.com/dudor" target="_blank" title={browser.i18n.getMessage('author')}><AiOutlineGithub /></a>
                </Dropdown.ItemText>
            </Dropdown.Menu >
        </IconContext.Provider>
    )
}


ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>,
);
