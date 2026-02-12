import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { EditorState, convertFromRaw, convertToRaw } from "draft-js";
import { Editor } from "react-draft-wysiwyg";
import "react-draft-wysiwyg/dist/react-draft-wysiwyg.css";
import { markdownToDraft, draftToMarkdown } from "markdown-draft-js";

const RichTextEditor = memo(({
    onChange,
    defaultValue,
    editorClassName,
    ...otherProps
}) => {
    const [editorState, setEditorState] = useState(EditorState.createEmpty());
    const isUserTypingRef = useRef(false);
    const [lastDefaultValue, setLastDefaultValue] = useState(defaultValue);

    // Initialize editor state only on mount or when defaultValue changes from outside
    useEffect(() => {
        if (defaultValue !== lastDefaultValue && !isUserTypingRef.current) {
            if (defaultValue && defaultValue.trim()) {
                try {
                    const contentState = convertFromRaw(markdownToDraft(defaultValue));
                    setEditorState(EditorState.createWithContent(contentState));
                } catch (error) {
                    console.warn("Failed to parse markdown content:", error);
                    setEditorState(EditorState.createEmpty());
                }
            } else {
                setEditorState(EditorState.createEmpty());
            }
            setLastDefaultValue(defaultValue);
        }
    }, [defaultValue, lastDefaultValue]);

    const handleEditorChange = useCallback((state) => {
        setEditorState(state);
        isUserTypingRef.current = true;

        if (onChange) {
            const rawContentState = convertToRaw(state.getCurrentContent());
            const markdownContent = draftToMarkdown(rawContentState);
            onChange(markdownContent);
        }

        // Reset typing flag after a short delay
        setTimeout(() => {
            isUserTypingRef.current = false;
        }, 1000);
    }, [onChange]);

    let editorRef = null;

    const handleEditorRef = (ref) => {
        editorRef = ref;
    };

    return (
        <Editor
            toolbarStyle={{ position: "sticky", top: 0, zIndex: 50 }}
            editorState={editorState}
            onEditorStateChange={handleEditorChange}
            editorClassName={editorClassName}
            toolbar={{
                options: ["inline"],
                inline: {
                    options: ["bold", "italic", "underline"],
                },
            }}
            editorRef={handleEditorRef}
            {...otherProps}
        />
    );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
