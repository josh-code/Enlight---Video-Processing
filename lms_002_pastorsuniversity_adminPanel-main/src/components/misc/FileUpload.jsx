import { useEffect, useState } from "react";
import { useController } from "react-hook-form";
import { cn } from "@/lib/utils";
import { EmptyFile, Trash2 } from "@/assets/icons";
import { resizeImage } from "@/lib/utils";
import { IMAGE_RESIZE_WIDTH } from "@/lib/constant";
import { toast } from "sonner";

const FileUpload = ({
  label,
  control,
  name,
  fileTypes,
  children,
  className,
  placeholderClassname,
  labelClassName,
  defaultValue,
  disabled,
  allowDragAndDrop = true,
}) => {
  const [filePreview, setFilePreview] = useState(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (defaultValue && !(defaultValue instanceof File)) {
      if (typeof defaultValue === "string") {
        setFilePreview(defaultValue);
      } else if (
        defaultValue &&
        defaultValue.key &&
        defaultValue.size &&
        defaultValue.name
      ) {
        setFilePreview(defaultValue.key);
        setFileName(defaultValue.name);
        setFileSize((defaultValue.size / (1024 * 1024)).toFixed(2) + " MB");
      }
    }
  }, [defaultValue]);

  const dashedBorder =
    "data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='black' stroke-width='1' stroke-dasharray='6%2c 14' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e";

  const {
    field: { onChange },
  } = useController({
    name,
    control,
  });

  const handleFileChange = async (file) => {
    if (file) {
      const fileSizeMB = file.size / (1024 * 1024);
      const MAX_VIDEO_FILE_SIZE_MB = 2048; // 2GB limit for videos

      // Check file size for videos
      if (
        file.type.startsWith("video/") &&
        fileSizeMB > MAX_VIDEO_FILE_SIZE_MB
      ) {
        toast.error(
          `Video file size exceeds the maximum allowed size of ${MAX_VIDEO_FILE_SIZE_MB} MB.`
        );
        return;
      }

      // Check if the file is an image
      if (file.type.startsWith("image/")) {
        try {
          const imageURL = URL.createObjectURL(file);
          setFilePreview(imageURL);

          const resizedImageBlob = await resizeImage(file, IMAGE_RESIZE_WIDTH);

          // Create a new File object with the resized blob (we manually set the name)
          const resizedImageFile = new File([resizedImageBlob], file.name, {
            type: file.type,
          });

          // Pass the resized image file to the parent or handle it here
          onChange(resizedImageFile);

          // Set the file name and size for the resized image
          setFileName(resizedImageFile.name); // Use the name from the original file
          setFileSize(
            (resizedImageBlob.size / (1024 * 1024)).toFixed(2) + " MB"
          ); // Update size for resized image
        } catch (error) {
          console.error("Error resizing image:", error);
        }
      }

      // If it's not an image, just update with the original file
      else {
        onChange(file); // Use the original file
        setFileName(file.name);
        setFileSize(fileSizeMB.toFixed(2) + " MB");

        const fileURL = URL.createObjectURL(file);
        setFilePreview(fileURL); // Preview the original file
      }
    }
  };

  // const handleFileChange = (file) => {
  //   if (file) {
  //     const fileSizeMB = file.size / (1024 * 1024);

  //     if (file.type.startsWith("image/")) {
  //       if (fileSizeMB > MAX_IMAGE_FILE_SIZE_MB) {
  //         toast.error(
  //           `File size exceeds the maximum allowed size of ${MAX_IMAGE_FILE_SIZE_MB} MB.`
  //         );
  //         return;
  //       }
  //     }

  //     onChange(file);
  //     setFileName(file.name);
  //     setFileSize((file.size / (1024 * 1024)).toFixed(2) + " MB");

  //     const fileURL = URL.createObjectURL(file);
  //     setFilePreview(fileURL);
  //   }
  // };

  const handleRemoveFile = () => {
    setFilePreview(null);
    onChange(null);
  };

  useEffect(() => {
    return () => {
      if (filePreview && fileTypes.some((ft) => ft.value.startsWith("video"))) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [filePreview, fileTypes]);

  const acceptedFileTypes = fileTypes.map((ft) => ft.value).join(", ");

  const handleDragOver = (event) => {
    event.preventDefault();
    if (allowDragAndDrop) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    if (allowDragAndDrop) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    if (allowDragAndDrop) {
      setIsDragging(false);
      const file = event.dataTransfer.files[0];
      handleFileChange(file);
    }
  };

  return (
    <div
      className={cn("file-upload space-y-2", className)}
      onDragOver={allowDragAndDrop ? handleDragOver : undefined}
      onDragLeave={allowDragAndDrop ? handleDragLeave : undefined}
      onDrop={allowDragAndDrop ? handleDrop : undefined}
    >
      <label className={cn("font-bold text-sm", labelClassName)}>{label}</label>
      <div
        className={cn(
          "relative flex flex-col items-center justify-center gap-5 aspect-video rounded overflow-hidden",
          placeholderClassname,
          isDragging ? "border-2 border-dashed border-site-primary" : ""
        )}
        style={{
          border: filePreview ? "none" : "1px dashed transparent",
          backgroundImage: filePreview ? "none" : `url("${dashedBorder}")`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
        }}
      >
        {filePreview ? (
          <>
            {fileTypes.some((ft) => ft.value.startsWith("image")) && (
              <img
                src={filePreview}
                alt="Selected"
                className="absolute top-0 left-0 w-full h-full object-cover"
              />
            )}
            {fileTypes.some((ft) => ft.value.startsWith("video")) && (
              <video
                src={filePreview}
                controls
                className="absolute top-0 left-0 w-full h-full"
              />
            )}
            {!fileTypes.some(
              (ft) =>
                ft.value.startsWith("image") || ft.value.startsWith("video")
            ) && (
                <>
                  <div>
                    <EmptyFile className="fill-site-general" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-site-general">
                      {fileName}
                    </p>
                    <p className="text-xs text-site-general">{fileSize}</p>
                  </div>
                </>
              )}
            <div className="absolute top-2.5 right-2.5 flex items-center gap-4">
              <button
                className="bg-black shadow rounded-full h-full w-full"
                disabled={disabled}
                type="button"
                onClick={handleRemoveFile}
              >
                <Trash2 style={{ fill: "white" }} width="20" height="20" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div>{children}</div>
            <input
              type="file"
              accept={acceptedFileTypes}
              onChange={(event) => handleFileChange(event.target.files[0])}
              className="hidden"
              id={label}
            />
            <label
              htmlFor={label}
              className="cursor-pointer border border-site-primary text-site-primary rounded-[7px] px-4 py-1.5"
            >
              Browse Files
            </label>
          </>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
