import type { ProjectEditorClasses } from "@/components/profile/ProjectListEditor";

import styles from "./apply.module.css";

/** Der Projekt-Editor im Stil des Freelancer-Portals: Bewerbung und Dashboard. */
export const PROJECT_EDITOR_CLASSES: ProjectEditorClasses = {
  field: styles.field,
  input: "",
  textarea: "",
  select: "",
  button: styles.uploadButton,
  buttonPrimary: styles.uploadButton,
  buttonDanger: styles.textButton,
  textLink: styles.textButton,
  note: styles.hint,
};
